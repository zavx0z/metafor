import{n as A,o as ee,q as N,v as L,w as R,x as ne,y as x,z as te,A as le,l as g,B as V,C as H,i as S,D as re,p as se,E as oe,e as ie,F as ce,d as $,G as C,g as fe,H as ue,I as ae,f as M,P as de,s as _e,J as pe}from"./proxy.f2b2a3b4.js";const he=0,me=1,ge=6,ye=7;function ve(n){return{d:null,e:null,i:n,p:null,r:null,t:he}}function be(){return{a:null,ae:null,c:null,ce:null,d:null,e:null,p:A,r:null,t:me,v:!1}}function xe(){return{d:null,e:null,p:A,r:null,t:ge}}function ke(){return{d:null,e:null,p:A,r:null,t:ye}}let u=null;function v(n){u=n}function q(n){const e=[];let t=n,r=null;for(;t!==null;){const l=t.nodeType,o=t.nextSibling;if(l===8){const c=t.data;if(c.startsWith("ssr:")){const a=c.slice(4);if(r===null)r=a;else{if(a===r)return e;e.push(t)}t=o;continue}}r!==null&&e.push(t),t=o}return null}function B(n,e){let t=n;if(u!==null)if(e&&(t=t.firstChild),t.nodeType===8){let r=t.$$fragment;r===void 0?r=q(t):ee(()=>{t.$$fragment=void 0}),v(r)}else{const r=t.firstChild;v(r===null?[]:[r])}}var b,T,P,E,U,W,z,Y,Ce;function we(){b===void 0&&(b=Node.prototype,T=Element.prototype,P=Text.prototype,E=Map.prototype,U=b.appendChild,W=b.cloneNode,E.set,E.get,E.delete,Ce=document,T.__click=void 0,P.__nodeValue=" ",T.__className="",z=N(b,"firstChild").get,Y=N(b,"nextSibling").get,N(b,"textContent").set,N(T,"className").set)}function K(n,e){U.call(n,e)}function Ne(n,e){return W.call(n,e)}function Te(n){const e=z.call(n);if(u!==null)if(e===null){const t=document.createTextNode("");return n.appendChild(t),t}else return D(e);return e}function Ke(n){if(u!==null){const e=n[0];return u!==null&&e!==null?D(e):e}return z.call(n)}function je(n){const e=Y.call(n);return u!==null&&e!==null?D(e):e}function D(n){if(n.nodeType===8&&n.data.startsWith("ssr:")&&u.at(-1)!==n){const e=q(n),r=(e.at(-1)||n).nextSibling;return r.$$fragment=e,r}return n}function Ee(n){var e=document.createElement("template");return e.innerHTML=n,e.content}function Oe(n,e,t){if(L(n)){for(var r=0,l;r<n.length;r++)l=n[r],t===null?K(e,l):t.before(l);return n[0]}else n!==null&&(t===null?K(e,n):t.before(n));return n}function m(n){var e=n;if(L(n))for(var t=0,r;t<n.length;t++)r=n[t],t===0&&(e=r),r.isConnected&&r.remove();else n.isConnected&&n.remove();return e}function w(n,e,t){const r=[];for(const l of n){const o=l.r;e==="in"?(o==="in"||o==="both"?l.in():l.c(),l.d.inert=!1,R(l.e,!1)):e==="key"?o==="key"&&(l.p=l.i(t),l.in()):((o==="out"||o==="both")&&(l.p=l.i(),r.push(l.o)),l.d.inert=!0,R(l.e,!0))}if(r.length>0){const l=ne(()=>{x(l);const o=te(()=>{x(o),le(r)})},!1)}}const Se=new Set,j=new Set;function G(){return document.createTextNode("")}function J(n,e){let t;return()=>{if(t===void 0){const r=Ee(n);t=e?r:Te(r)}return t}}function Q(n,e,t,r){if(u!==null){t!==null&&B(t,!1);const l=u;if(l!==null)return n?l:l[0]}return e?Ne(r(),!0):document.importNode(r(),!0)}function $e(n,e,t){return Q(!1,e,n,t)}function Ae(n,e,t){return Q(!0,e,n,t)}const Le=J(" ",!1),qe=J("<!>",!0);function Fe(n){return $e(n,!0,Le)}function Ue(n){return Ae(n,!0,qe)}function X(n,e,t){const r=A,l=e?L(n)?n:Array.from(n.childNodes):n;t!==null&&u===null&&Oe(l,null,t),r.d=l}function We(n,e){X(e,!1,n)}function Ye(n,e){X(e,!0,n)}function Ge(n,e){g(()=>{const t=e();Be(n,t)})}function Be(n,e){const t=n.__nodeValue,r=Ve(e);u!==null&&n.nodeValue===r?n.__nodeValue=r:t!==r&&(n.nodeValue=r,n.__nodeValue=r)}function Je(n,e,t){S(()=>{e(n),g(()=>()=>{g(()=>{S(()=>{(!pe(t)||t.v===n)&&e(null)})})})})}function Ie(n,e){var a;const t=e.type,r=((a=e.composedPath)==null?void 0:a.call(e))||[];let l=r[0]||e.target;e.target!==l&&$(e,"target",{configurable:!0,value:l});let o=0;const c=e.__root;if(c){const _=r.indexOf(c);_<r.indexOf(n)&&(o=_)}for(l=r[o]||e.target,$(e,"currentTarget",{configurable:!0,get(){return l||document}});l!==null;){const _=l.parentNode||l.host||null,i="__"+t,s=l[i];if(s!==void 0&&!l.disabled)if(L(s)){const[f,...p]=s;f.apply(l,[e,...p])}else s.call(l,e);if(e.cancelBubble||_===n)break;l=_}e.__root=n}function Qe(n,e,t,r){B(n),e===void 0?r!==null&&r(n):e(n,t)}function Xe(n,e,t,r){const l=be();B(n);const o=u;let c=null,a=null,_=!1,i=!1;const s=g(()=>{var y;const d=!!e();if(l.v!==d||!_){if(l.v=d,_){const h=l.c,k=l.a;d?(k===null||k.size===0?C(p):w(k,"out"),h===null||h.size===0?C(f):w(h,"in")):(h===null||h.size===0?C(f):w(h,"out"),k===null||k.size===0?C(p):w(k,"in"))}else if(u!==null){const h=(y=u==null?void 0:u[0])==null?void 0:y.data;!h||h==="ssr:if:true"&&!d||h==="ssr:if:false"&&d?(m(u),v(null)):u.shift()}_=!0}},l,!1),f=g(()=>{c!==null&&(m(c),c=null),l.v&&(t(n),i||(v(o),i=!0)),c=l.d,l.d=null},l,!0);l.ce=f;const p=g(()=>{a!==null&&(m(a),a=null),l.v||(r!==null&&r(n),i||(v(o),i=!0)),a=l.d,l.d=null},l,!0);l.ae=p,V(s,()=>{c!==null&&m(c),a!==null&&m(a),x(f),x(p)}),l.e=s}function Ze(n){const e=xe(),t=u!==null?q(document.head.firstChild):null,r=u;v(t);try{const l=g(()=>{const o=e.d;o!==null&&(m(o),e.d=null);let c=null;u===null&&(c=G(),document.head.appendChild(c)),n(c)},e,!1);V(l,()=>{const o=e.d;o!==null&&m(o)}),e.e=l}finally{v(r)}}function en(n,e,t){const r=ke();let l=null;B(n);let o=null;r.r=i=>{const s=l,f=s.s;f.add(i),i.f(()=>{f.delete(i),f.size===0&&s.e!==null&&(s.d!==null&&(m(s.d),s.d=null),x(s.e),s.e=null)})};const c=()=>{const i={d:null,e:null,s:new Set,p:l},s=g(()=>{const f=r.d;f!==null&&(m(f),r.d=null),o&&t(o),i.d=r.d,r.d=null},r,!0);i.e=s,l=i},a=()=>{const i=l;if(i===null){c();return}const s=i.s;s.size===0?(i.d!==null&&(m(i.d),i.d=null),i.e?C(i.e):c()):(c(),w(s,"out"))},_=g(()=>{const i=e();o!==i&&(o=i,a())},r,!1);V(_,()=>{let i=l;for(;i!==null;){const s=i.d;s!==null&&m(s);const f=i.e;f!==null&&x(f),i=i.p}}),r.e=_}function Ve(n){return typeof n=="string"?n:n==null?"":n+""}function nn(n,e,t){let r;H(()=>{if(t){const l=t();S(()=>{if(r===void 0)r=e(n,l);else{const o=r.update;typeof o=="function"&&o(l)}})}else S(()=>r=e(n))}),H(()=>{if(r!==void 0){const l=r.destroy;if(typeof l=="function")return()=>{l()}}})}function ze(n,e,t){t=t==null?null:t+"",Re(n,e,t),(u===null||n.getAttribute(e)!==t&&e!=="src"&&e!=="href"&&e!=="srcset")&&(t===null?n.removeAttribute(e):n.setAttribute(e,t))}let O;function I(n,e){return n===e?!0:(O||(O=document.createElement("a")),O.href=e,n===O.href)}function F(n){return n.split(",").map(e=>e.trim().split(" ").filter(Boolean))}function De(n,e){const t=F(n.srcset),r=F(e??"");return r.length===t.length&&r.every(([l,o],c)=>o===t[c][1]&&(I(t[c][0],l)||I(l,t[c][0])))}function Re(n,e,t){u&&(e!=="src"&&e!=="href"&&e!=="srcset"||e==="srcset"&&De(n,t)||I(n.getAttribute(e)??"",t??"")||console.error(`Detected a ${e} attribute value change during hydration. This will not be repaired during hydration, the ${e} value that came from the server will be used. Related element:`,n," Differing value:",t))}function tn(n,e,t){g(()=>{He(n,e,t())})}function He(n,e,t){e in n?n[e]=typeof n[e]=="boolean"&&t===""?!0:t:ze(n,e,t)}function ln(n,e){const t={},r={};function l(s,f){const p=_e(f);r[s]=p,$(t,s,{get(){return fe(p)},enumerable:!0})}for(const s in e.props||{})l(s,e.props[s]);const o=new Proxy(t,{get:(s,f)=>typeof f!="string"?s[f]:(f in r||l(f,void 0),t[f])}),c=ue(o);let[a,_]=Z(n,{...e,props:c});const i={$set:s=>{for(const[f,p]of ae(s))f in r?M(r[f],p):(l(f,p),M(c,o))},$destroy:_};for(const s of re(a||{}))$(i,s,{get(){return a[s]},set(f){a[s]=f},enumerable:!0});return i}function Z(n,e){var f,p;we();const t=new Set,r=e.target,l=ve(e.intro||!1),o=r.firstChild,c=q(o),a=u;let _;try{let d=null;c===null&&(d=G(),r.appendChild(d)),v(c);const y=g(()=>{e.context&&(se({}),oe.c=e.context),_=n(d,e.props||{},e.events||{}),e.context&&ie()},l,!0);l.e=y}catch(d){if(e.recover!==!1&&c!==null)return console.error("ERR_SVELTE_HYDRATION_MISMATCH: Hydration failed because the initial UI does not match what was rendered on the server.",d),m(c),o.remove(),(p=(f=c.at(-1))==null?void 0:f.nextSibling)==null||p.remove(),Z(n,e);throw d}finally{v(a)}const i=Ie.bind(null,r),s=d=>{for(let y=0;y<d.length;y++){const h=d[y];t.has(h)||(t.add(h),r.addEventListener(h,i,de.includes(h)?{passive:!0}:void 0))}};return s(ce(Se)),j.add(s),[_,()=>{for(const y of t)r.removeEventListener(y,i);j.delete(s);const d=l.d;d!==null&&m(d),c!==null&&m(c),x(l.e)}]}const Me="5";typeof window<"u"&&(window.__svelte||(window.__svelte={v:new Set})).v.add(Me);export{Ce as $,Ye as a,en as b,ln as c,We as d,Ke as e,Ue as f,$e as g,Te as h,Xe as i,Fe as j,J as k,Je as l,Ze as m,Qe as n,Ae as o,Be as p,tn as q,nn as r,je as s,Ge as t};