#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM

# Exercise the Docker address rewrite without minting real credentials.
cat > "$test_dir/t3" <<'MOCK'
#!/bin/sh
test "$1" = pair
if [ "${T3_PAIR_TEST_FAIL:-0}" = 1 ]; then exit 9; fi
printf 'Pairing URL: http://172.18.0.2:3773/pair#token=test-one-time-grant\n'
MOCK
chmod 0755 "$test_dir/t3"
export PATH="$test_dir:$PATH"

result=$(sh "$repo_dir/scripts/t3-pair.sh" https://agent.example/)
expected='Pairing URL: https://agent.example/pair#token=test-one-time-grant'
test "$(printf '%s\n' "$result" | head -1)" = "$expected"

result=$(T3_PUBLIC_URL=http://100.100.100.42:18773 sh "$repo_dir/scripts/t3-pair.sh")
expected='Pairing URL: http://100.100.100.42:18773/pair#token=test-one-time-grant'
test "$(printf '%s\n' "$result" | head -1)" = "$expected"

for invalid in ftp://agent.example http:// http://agent.example/path \
    'http://agent.example?token=bad' 'http://agent.example#bad' \
    'http://user:password@agent.example' 'http://agent example'; do
    if sh "$repo_dir/scripts/t3-pair.sh" "$invalid" >/dev/null 2>&1; then
        echo "Accepted invalid origin: $invalid" >&2
        exit 1
    fi
done

if T3_PAIR_TEST_FAIL=1 sh "$repo_dir/scripts/t3-pair.sh" >/dev/null 2>&1; then
    echo "Ignored a failed T3 pairing command." >&2
    exit 1
fi
echo "Pairing helper checks passed."
