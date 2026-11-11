# shellcheck shell=sh
# Service-launcher protocol detection for the T3 wrapper scripts.
#
# Upstream has no command that prints the launcher protocol. Its preflight
# reports the value the launcher passed and blocks every other one, so ask with
# the protocol this image knows and retry with the one the runtime names.

T3_KNOWN_LAUNCHER_PROTOCOL=4

t3_runtime_protocol() {
    _t3_entry=$1
    _t3_database=$2
    _t3_protocol=$T3_KNOWN_LAUNCHER_PROTOCOL

    _t3_result=$("$_t3_entry" __service-preflight --database-path "$_t3_database" \
        --launcher-protocol "$_t3_protocol") || {
        printf 'Could not run the T3 service preflight for %s.\n' "$_t3_entry" >&2
        return 1
    }
    _t3_status=$(printf '%s\n' "$_t3_result" | jq -er '.status' 2>/dev/null) || {
        printf 'The T3 service preflight returned unexpected output for %s: %s\n' \
            "$_t3_entry" "$_t3_result" >&2
        return 1
    }
    if [ "$_t3_status" = ready ]; then
        printf '%s\n' "$_t3_protocol"
        return 0
    fi

    # A database complaint has no "requires protocol", and must stay a failure:
    # running an older runtime on a newer database is not safe.
    _t3_required=$(printf '%s\n' "$_t3_result" | jq -er \
        '.reason | capture("requires protocol (?<protocol>[0-9]+)").protocol' 2>/dev/null) || {
        printf '%s\n' "$_t3_result" | jq -er '.reason' >&2 2>/dev/null ||
            printf '%s\n' "$_t3_result" >&2
        return 1
    }

    _t3_result=$("$_t3_entry" __service-preflight --database-path "$_t3_database" \
        --launcher-protocol "$_t3_required") || {
        printf 'Could not run the T3 service preflight for %s.\n' "$_t3_entry" >&2
        return 1
    }
    _t3_status=$(printf '%s\n' "$_t3_result" | jq -er '.status' 2>/dev/null) || {
        printf 'The T3 service preflight returned unexpected output for %s: %s\n' \
            "$_t3_entry" "$_t3_result" >&2
        return 1
    }
    if [ "$_t3_status" != ready ]; then
        printf '%s\n' "$_t3_result" | jq -er '.reason' >&2 2>/dev/null ||
            printf '%s\n' "$_t3_result" >&2
        return 1
    fi
    printf '%s\n' "$_t3_required"
}
