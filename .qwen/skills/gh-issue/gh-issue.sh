#!/bin/bash
# GitHub Issue Creator
# Usage: gh-issue.sh <title> [body] [--project <number>]

set -e

REPO="zavx0z/metafor"
PROJECT_NUMBER=""

# Parse arguments
TITLE=""
BODY=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --project)
            PROJECT_NUMBER="$2"
            shift 2
            ;;
        --repo)
            REPO="$2"
            shift 2
            ;;
        *)
            if [[ -z "$TITLE" ]]; then
                TITLE="$1"
            elif [[ -z "$BODY" ]]; then
                BODY="$1"
            else
                BODY="$BODY $1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$TITLE" ]]; then
    echo "Usage: gh-issue.sh <title> [body] [--project <number>] [--repo <repo>]"
    exit 1
fi

# Create issue
if [[ -n "$BODY" ]]; then
    ISSUE_URL=$(gh issue create --title "$TITLE" --body "$BODY" --repo "$REPO")
else
    ISSUE_URL=$(gh issue create --title "$TITLE" --repo "$REPO")
fi

echo "✅ Issue created: $ISSUE_URL"

# Add to project if specified
if [[ -n "$PROJECT_NUMBER" ]]; then
    ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')
    echo "📋 Adding to project #$PROJECT_NUMBER..."
    # Note: Adding to project requires additional API call
    echo "ℹ️  Use GitHub UI or projects API to add issue #$ISSUE_NUMBER to project #$PROJECT_NUMBER"
fi
