#!/usr/bin/env bash
set -euo pipefail

chrome_api=${META_CHROME_API:-http://127.0.0.1:7880}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

cdp_command() {
	local target_id=$1
	local method=$2
	local params=$3
	local body
	body=$(jq -cn \
		--arg targetId "$target_id" \
		--arg method "$method" \
		--argjson params "$params" \
		'{targetId:$targetId,method:$method,params:$params}')
	curl -fsS --max-time 3 -X POST "$chrome_api/cdp/command" \
		-H 'content-type: application/json' \
		--data-binary "$body"
}

evaluate() {
	local target_id=$1
	local expression=$2
	local params
	params=$(jq -cn --arg expression "$expression" \
		'{expression:$expression,returnByValue:true}')
	cdp_command "$target_id" Runtime.evaluate "$params"
}

dispatch_mouse() {
	local target_id=$1
	local type=$2
	local x=$3
	local y=$4
	local buttons=$5
	local params
	params=$(jq -cn \
		--arg type "$type" \
		--argjson x "$x" \
		--argjson y "$y" \
		--argjson buttons "$buttons" \
		'{type:$type,x:$x,y:$y,button:"left",buttons:$buttons,clickCount:1}')
	cdp_command "$target_id" Input.dispatchMouseEvent "$params" >/dev/null
}

watch_capture() {
	local target_id=$1
	local token=$2
	local attempt response state current_token active points point_count point_index point x y
	local token_json
	token_json=$(jq -cn --arg token "$token" '$token')

	for attempt in $(seq 1 250); do
		response=$(evaluate "$target_id" "JSON.stringify((()=>{const c=document.querySelector('canvas');const r=c?.getBoundingClientRect();return {token:globalThis.__metaforCaptureTriggerToken,active:Boolean(globalThis.webgpuInspector?._localCaptureActive),points:r?[[.39,.42],[.43,.445],[.47,.465],[.51,.485],[.55,.505]].map(([px,py])=>({x:Math.round(r.left+r.width*px),y:Math.round(r.top+r.height*py)})):[]}})())")
		state=$(jq -r '.result.result.value // empty' <<<"$response")
		current_token=$(jq -r '.token // ""' <<<"$state")
		[[ $current_token == "$token" ]] || exit 0
		active=$(jq -r '.active // false' <<<"$state")
		if [[ $active == true ]]; then
			points=$(jq -c '.points' <<<"$state")
			point_count=$(jq -r 'length' <<<"$points")
			(( point_count >= 2 )) || die "instrumented canvas has no usable bounds"
			point=$(jq -c '.[0]' <<<"$points")
			x=$(jq -r '.x' <<<"$point")
			y=$(jq -r '.y' <<<"$point")
			dispatch_mouse "$target_id" mousePressed "$x" "$y" 1
			for ((point_index = 1; point_index < point_count; point_index++)); do
				point=$(jq -c ".[$point_index]" <<<"$points")
				x=$(jq -r '.x' <<<"$point")
				y=$(jq -r '.y' <<<"$point")
				dispatch_mouse "$target_id" mouseMoved "$x" "$y" 1
			done
			dispatch_mouse "$target_id" mouseReleased "$x" "$y" 0
			evaluate "$target_id" "if(globalThis.__metaforCaptureTriggerToken===$token_json)delete globalThis.__metaforCaptureTriggerToken;true" >/dev/null
			printf 'capture-triggered target=%s attempt=%s\n' "$target_id" "$attempt"
			exit 0
		fi
		sleep 0.04
	done
	evaluate "$target_id" "if(globalThis.__metaforCaptureTriggerToken===$token_json)delete globalThis.__metaforCaptureTriggerToken;true" >/dev/null || true
	die "capture was not armed within 10 seconds"
}

(( $# == 1 )) || die "usage: $0 instrumented-target-id"
target_id=$1
[[ $target_id =~ ^[0-9A-Fa-f]+$ ]] || die "invalid CDP target id: $target_id"

for command_name in curl jq uuidgen; do
	command -v "$command_name" >/dev/null 2>&1 || die "$command_name is missing"
done

curl -fsS --max-time 2 "$chrome_api/health" >/dev/null \
	|| die "@meta/chrome is unavailable at $chrome_api"
targets=$(curl -fsS --max-time 2 "$chrome_api/cdp/targets")
jq -e --arg target_id "$target_id" \
	'.targets[] | select(.targetId == $target_id and .type == "page")' \
	<<<"$targets" >/dev/null \
	|| die "page target is not present: $target_id"

probe=$(evaluate "$target_id" \
	"Boolean(globalThis.webgpuInspector && document.querySelector('canvas'))")
[[ $(jq -r '.result.result.value // false' <<<"$probe") == true ]] \
	|| die "target is not an instrumented canvas page: $target_id"

token=$(uuidgen)
token_json=$(jq -cn --arg token "$token" '$token')
evaluate "$target_id" \
	"globalThis.__metaforCaptureTriggerToken=$token_json;true" >/dev/null

printf 'armed capture trigger\ntarget: %s\n' "$target_id"
watch_capture "$target_id" "$token"
