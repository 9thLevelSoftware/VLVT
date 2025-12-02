#!/bin/bash

# Railway CLI Wrapper Script - DevOps Tool
# Provides convenient interface for Railway deployment operations

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Display usage
usage() {
    echo -e "${GREEN}Railway CLI Wrapper - DevOps Tool${NC}"
    echo ""
    echo -e "${CYAN}USAGE:${NC}"
    echo "    $0 <command> [options]"
    echo ""
    echo -e "${CYAN}COMMANDS:${NC}"
    echo "    logs [--service NAME] [-f]     View service logs"
    echo "    db [-c QUERY] [-f FILE]        Database operations"
    echo "    status                         Show project status"
    echo "    services                       List all services"
    echo "    deploy [--service NAME]        Deploy services"
    echo "    deployments                    View deployment history"
    echo "    env [--service NAME]           View environment variables"
    echo "    restart --service NAME         Restart a service"
    echo "    link                           Link to Railway project"
    echo "    open                           Open Railway dashboard"
    echo "    help                           Show this help"
    echo ""
    echo -e "${CYAN}EXAMPLES:${NC}"
    echo "    $0 logs --service chat-service"
    echo "    $0 db -c '\dt'"
    echo "    $0 db -f migrations/005_add_subscriptions_table.sql"
    echo "    $0 deploy"
    echo ""
    exit 0
}

# Check if Railway CLI is installed
check_railway() {
    if ! command -v railway &> /dev/null; then
        echo -e "${RED}Error: Railway CLI not found. Install with: npm install -g @railway/cli${NC}"
        exit 1
    fi
}

# Main
check_railway

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    logs)
        echo -e "${YELLOW}Fetching logs...${NC}"
        railway logs "$@"
        ;;

    db)
        QUERY=""
        FILE=""
        while [[ $# -gt 0 ]]; do
            case $1 in
                -c)
                    QUERY="$2"
                    shift 2
                    ;;
                -f)
                    FILE="$2"
                    shift 2
                    ;;
                *)
                    shift
                    ;;
            esac
        done

        if [ -n "$QUERY" ]; then
            echo -e "${YELLOW}Running query...${NC}"
            echo "$QUERY"
            echo ""
            echo "$QUERY" | railway connect postgres
        elif [ -n "$FILE" ]; then
            if [ -f "$FILE" ]; then
                echo -e "${YELLOW}Running SQL file: $FILE${NC}"
                cat "$FILE" | railway connect postgres
            else
                echo -e "${RED}Error: File not found: $FILE${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}Connecting to database...${NC}"
            railway connect postgres
        fi
        ;;

    status)
        echo -e "${GREEN}Project Status:${NC}"
        railway status
        ;;

    services)
        echo -e "${GREEN}Services:${NC}"
        railway service list
        ;;

    deploy)
        echo -e "${YELLOW}Deploying...${NC}"
        railway up "$@"
        ;;

    deployments)
        echo -e "${GREEN}Deployment History:${NC}"
        railway deployment list "$@"
        ;;

    env)
        echo -e "${GREEN}Environment Variables:${NC}"
        railway variables "$@"
        ;;

    restart)
        echo -e "${YELLOW}Restarting service...${NC}"
        railway redeploy "$@"
        ;;

    link)
        echo -e "${YELLOW}Linking to Railway project...${NC}"
        railway link
        ;;

    open)
        echo -e "${GREEN}Opening Railway dashboard...${NC}"
        railway open
        ;;

    help|--help|-h)
        usage
        ;;

    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
