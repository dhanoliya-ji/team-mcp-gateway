#!/bin/bash
# smoke-test.sh
# Quick checks of the main features, using curl.
# Usage: bash scripts/smoke-test.sh
#
# It logs in as admin, makes 2 users (A and B), and checks:
#   - tool list from all servers, and tool calls
#   - a slow tool hits the timeout with a clear error
#   - revoke B's key -> B is rejected
#   - disable a server -> its tools are gone
#   - the audit log has every call under the right user

G=${GATEWAY:-http://dashboard.localtest.me}
NS=${NAMESPACE:-mcp}

# Small helpers --------------------------------------------------------
json() { node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log($1)"; }
post() { curl -s "$G$1" -H 'content-type: application/json' -H "authorization: Bearer $2" -d "$3"; }
mcp()  { curl -s "$G/mcp" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
              -H "authorization: Bearer $1" -d "$2"; }
step() { echo; echo "=== $1"; }

step "Log in as admin"
PW=$(kubectl -n $NS get secret app-secrets -o jsonpath="{.data.GATEWAY_ADMIN_PASSWORD}" | base64 -d)
ADMIN=$(post /api/login "" "{\"email\":\"admin@example.com\",\"password\":\"$PW\"}" | json d.token)
echo "admin token: ${ADMIN:0:12}..."

step "Invite user A and user B, and give each an API key"
RUN=$RANDOM
for U in a b; do
  post /api/users $ADMIN "{\"email\":\"user-$U-$RUN@example.com\",\"name\":\"User $U\",\"role\":\"member\"}" > /dev/null
done
USERS=$(curl -s $G/api/users -H "authorization: Bearer $ADMIN")
B_ID=$(echo "$USERS" | json "d.users.find(u=>u.email==='user-b-$RUN@example.com').id")
KEY_B=$(post /api/keys $ADMIN "{\"name\":\"B laptop\",\"userId\":$B_ID}" | json d.apiKey)
echo "user B key: ${KEY_B:0:12}..."

step "User B lists tools (all servers, with server prefix)"
mcp $KEY_B '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | json "d.result.tools.map(t=>t.name).join('\n')"

step "User B asks: what orders came in today?"
mcp $KEY_B '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"woocommerce__list_orders","arguments":{"date":"today"}}}' \
  | json "d.result.content[0].text"

step "Same tool name on 3 servers (ping) -> no collision"
for S in woocommerce notes utils; do
  mcp $KEY_B "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"${S}__ping\",\"arguments\":{}}}" | json "d.result.content[0].text.replace(/\s+/g,' ')"
done

step "Slow tool (25 s) -> gateway timeout with a clear error"
mcp $KEY_B '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"utils__slow_task","arguments":{"seconds":25}}}' | json "d.result.content[0].text"

step "Revoke user B's key -> next call is rejected"
KEY_ID=$(curl -s $G/api/keys -H "authorization: Bearer $ADMIN" | json "d.keys.find(k=>k.userId===$B_ID).id")
curl -s -X DELETE $G/api/keys/$KEY_ID -H "authorization: Bearer $ADMIN" > /dev/null
mcp $KEY_B '{"jsonrpc":"2.0","id":5,"method":"tools/list"}'; echo

step "Disable the notes server -> its tools are gone"
NOTES_ID=$(curl -s $G/api/servers -H "authorization: Bearer $ADMIN" | json "d.servers.find(s=>s.name==='notes').id")
curl -s -X PUT $G/api/servers/$NOTES_ID -H 'content-type: application/json' -H "authorization: Bearer $ADMIN" -d '{"enabled":false}' | json "d.server.name+' -> '+d.server.status"
mcp $ADMIN '{"jsonrpc":"2.0","id":6,"method":"tools/list"}' | json "'notes tools left: '+d.result.tools.filter(t=>t.name.startsWith('notes__')).length"
curl -s -X PUT $G/api/servers/$NOTES_ID -H 'content-type: application/json' -H "authorization: Bearer $ADMIN" -d '{"enabled":true}' | json "'enabled again: '+d.server.name+' -> '+d.server.status"

step "Audit log (newest first)"
curl -s "$G/api/audit" -H "authorization: Bearer $ADMIN" \
  | json "d.rows.slice(0,8).map(r=>[r.user_email,r.via,r.server+'/'+r.tool,r.duration_ms+'ms',r.ok?'ok':'FAILED',r.error||''].join(' | ')).join('\n')"
