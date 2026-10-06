#!/usr/bin/env python3
"""
TeleSpark Telegram MTProto Executor Bridge
Executes automated Telegram operations via Telethon or simulation mode.
Reads JSON request from stdin or arg file, prints JSON result to stdout.
"""

import sys
import json
import asyncio
import os
import time
from typing import Dict, Any, Optional

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Standardized Failure Classifications matching NestJS Failure Classifier
ERROR_CODES = {
    "ACCOUNT_RESTRICTED": "ACCOUNT_RESTRICTED",
    "ACCOUNT_SESSION_INVALID": "ACCOUNT_SESSION_INVALID",
    "ACCOUNT_AUTH_REQUIRED": "ACCOUNT_AUTH_REQUIRED",
    "TEMPORARY_ERROR": "TEMPORARY_ERROR",
    "RATE_LIMITED": "RATE_LIMITED",
    "FLOOD_WAIT": "FLOOD_WAIT",
    "NETWORK_ERROR": "NETWORK_ERROR",
    "TIMEOUT": "TIMEOUT",
    "TARGET_NOT_FOUND": "TARGET_NOT_FOUND",
    "TARGET_PRIVATE": "TARGET_PRIVATE",
    "PERMISSION_DENIED": "PERMISSION_DENIED",
    "OPERATION_NOT_ALLOWED": "OPERATION_NOT_ALLOWED",
    "TASK_INVALID": "TASK_INVALID",
    "UNKNOWN_ERROR": "UNKNOWN_ERROR"
}

def map_telethon_exception(exc: Exception) -> tuple[str, str, Optional[int]]:
    """Maps a Telethon or Python exception into an internal standardized error code."""
    exc_name = type(exc).__name__
    msg = str(exc)
    flood_wait_seconds = None

    if "FloodWaitError" in exc_name or hasattr(exc, "seconds"):
        flood_wait_seconds = getattr(exc, "seconds", 60)
        return ERROR_CODES["FLOOD_WAIT"], f"Telegram FloodWait: {flood_wait_seconds}s", flood_wait_seconds

    if exc_name in ["SlowModeWaitError"]:
        return ERROR_CODES["RATE_LIMITED"], f"Slow mode active: {msg}", None

    if exc_name in ["UserDeactivatedError", "AuthKeyUnregisteredError", "SessionRevokedError"]:
        return ERROR_CODES["ACCOUNT_SESSION_INVALID"], f"Session invalid or deactivated: {msg}", None

    if exc_name in ["SessionPasswordNeededError", "PhoneNumberUnoccupiedError"]:
        return ERROR_CODES["ACCOUNT_AUTH_REQUIRED"], f"Authentication required: {msg}", None

    if exc_name in ["UserRestrictedError", "UserBannedInChannelError"]:
        return ERROR_CODES["ACCOUNT_RESTRICTED"], f"Account restricted: {msg}", None

    if exc_name in ["ChatWriteForbiddenError", "ChannelPrivateError"]:
        return ERROR_CODES["TARGET_PRIVATE"], f"Cannot access target: {msg}", None

    if exc_name in ["ChatAdminRequiredError", "RightForbiddenError"]:
        return ERROR_CODES["PERMISSION_DENIED"], f"Admin permissions required: {msg}", None

    if exc_name in ["PeerIdInvalidError", "UsernameNotOccupiedError", "UsernameInvalidError", "MessageIdInvalidError"]:
        return ERROR_CODES["TARGET_NOT_FOUND"], f"Target entity not found: {msg}", None

    if exc_name in ["TimeoutError", "asyncio.TimeoutError"]:
        return ERROR_CODES["TIMEOUT"], "Operation timed out", None

    if exc_name in ["ConnectionError", "RpcError"]:
        return ERROR_CODES["NETWORK_ERROR"], f"Network connection error: {msg}", None

    return ERROR_CODES["UNKNOWN_ERROR"], f"Unhandled exception [{exc_name}]: {msg}", None


async def execute_simulated_operation(task_type: str, payload: Dict[str, Any], account: Dict[str, Any]) -> Dict[str, Any]:
    """Provides a realistic simulation for test and dev environments without connecting to live Telegram."""
    # Simulation hook for error injection in testing
    if payload.get("_simulateError"):
        error_code = payload.get("_simulateError")
        return {
            "success": False,
            "errorCode": error_code,
            "errorMessage": payload.get("_simulateErrorMessage", f"Simulated error: {error_code}"),
            "floodWaitSeconds": payload.get("_simulateFloodWaitSeconds", 60 if error_code == "FLOOD_WAIT" else None),
            "simulated": True
        }

    # Simulate brief network processing latency
    await asyncio.sleep(0.05)

    if task_type in ["SEND_MESSAGE", "REPLY_MESSAGE", "COMMENT"]:
        return {
            "success": True,
            "data": {
                "messageId": int(time.time() * 1000) % 1000000,
                "chatId": payload.get("chatId", "test_chat"),
                "sentText": payload.get("text", ""),
                "timestamp": int(time.time())
            },
            "simulated": True
        }

    elif task_type == "REACTION":
        return {
            "success": True,
            "data": {
                "messageId": payload.get("messageId"),
                "reaction": payload.get("reaction", "👍"),
                "timestamp": int(time.time())
            },
            "simulated": True
        }

    elif task_type in ["JOIN_CHAT", "LEAVE_CHAT"]:
        return {
            "success": True,
            "data": {
                "chatId": payload.get("chatId"),
                "action": task_type.lower(),
                "timestamp": int(time.time())
            },
            "simulated": True
        }

    elif task_type == "FORWARD_MESSAGE":
        return {
            "success": True,
            "data": {
                "fromChatId": payload.get("fromChatId"),
                "toChatId": payload.get("toChatId"),
                "messageId": payload.get("messageId"),
                "forwardedMessageId": int(time.time() * 1000) % 1000000
            },
            "simulated": True
        }

    elif task_type in ["EDIT_MESSAGE", "DELETE_MESSAGE"]:
        return {
            "success": True,
            "data": {
                "chatId": payload.get("chatId"),
                "messageId": payload.get("messageId"),
                "status": "applied"
            },
            "simulated": True
        }

    elif task_type in ["GET_MESSAGES", "GET_CHAT_INFO", "GET_MEMBERS", "GET_ADMINS"]:
        return {
            "success": True,
            "data": {
                "query": task_type,
                "chatId": payload.get("chatId"),
                "count": 10,
                "items": []
            },
            "simulated": True
        }

    return {
        "success": True,
        "data": {"operation": task_type, "payload": payload},
        "simulated": True
    }


async def execute_telethon_operation(task_type: str, payload: Dict[str, Any], account: Dict[str, Any]) -> Dict[str, Any]:
    """Executes live Telegram operations using Telethon MTProto client."""
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
    except ImportError:
        # Fall back to simulation if telethon is not installed locally
        return await execute_simulated_operation(task_type, payload, account)

    session_string = account.get("sessionString")
    api_id = account.get("apiId") or int(os.environ.get("TELEGRAM_API_ID", 0))
    api_hash = account.get("apiHash") or os.environ.get("TELEGRAM_API_HASH", "")

    if not session_string or not api_id or not api_hash:
        return {
            "success": False,
            "errorCode": ERROR_CODES["ACCOUNT_SESSION_INVALID"],
            "errorMessage": "Missing Telegram session credentials (sessionString, apiId, or apiHash)"
        }

    client = TelegramClient(StringSession(session_string), api_id, api_hash)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            return {
                "success": False,
                "errorCode": ERROR_CODES["ACCOUNT_AUTH_REQUIRED"],
                "errorMessage": "Account is not authorized in Telegram session"
            }

        target = (
            payload.get("recipient")
            or payload.get("chatId")
            or payload.get("target")
            or payload.get("groupId")
            or payload.get("channelId")
            or payload.get("url")
            or payload.get("postUrl")
            or payload.get("link")
        )
        text = payload.get("text", "")

        if not target and task_type not in ["GET_ME"]:
            return {
                "success": False,
                "errorCode": ERROR_CODES["TASK_INVALID"],
                "errorMessage": f"Missing target/recipient in task payload: {payload}"
            }

        # Resolve numeric IDs if applicable
        if isinstance(target, str) and target.lstrip("-").isdigit():
            target = int(target)

        if task_type in ["SEND_MESSAGE", "SEND_DM"]:
            msg = await client.send_message(target, text)
            return {"success": True, "data": {"messageId": msg.id, "target": str(target)}}

        elif task_type == "REPLY_MESSAGE":
            reply_to = payload.get("replyToMessageId") or payload.get("messageId")
            msg = await client.send_message(target, text, reply_to=reply_to)
            return {"success": True, "data": {"messageId": msg.id, "replyToMessageId": reply_to}}

        elif task_type in ["COMMENT", "POST_COMMENT"]:
            raw_target = str(target)
            msg_id = int(payload.get("commentToMessageId") or payload.get("replyToMessageId") or payload.get("messageId") or 0)

            # Auto-parse t.me link if passed as target/chatId (e.g. https://t.me/ForPayoutRecords/728)
            if "t.me/" in raw_target:
                cleaned = raw_target.replace("https://", "").replace("http://", "").rstrip("/")
                parts = cleaned.split("/")
                if len(parts) >= 3 and parts[-1].isdigit():
                    target = parts[-2]
                    msg_id = int(parts[-1])
                elif len(parts) >= 2:
                    target = parts[-1]

            if not msg_id and payload.get("messageId"):
                msg_id = int(payload.get("messageId"))

            entity = await client.get_entity(target)
            try:
                if msg_id:
                    msg = await client.send_message(entity, text, comment_to=msg_id)
                else:
                    msg = await client.send_message(entity, text)
            except Exception:
                # If comment_to fails (e.g. already a discussion topic/group), fallback to reply_to
                if msg_id:
                    msg = await client.send_message(entity, text, reply_to=msg_id)
                else:
                    msg = await client.send_message(entity, text)

            return {"success": True, "data": {"messageId": msg.id, "target": str(target), "postMessageId": msg_id, "text": text}}

        elif task_type == "JOIN_CHAT":
            str_target = str(target)
            if "+" in str_target or "joinchat" in str_target:
                from telethon.tl.functions.messages import ImportChatInviteRequest
                invite_hash = str_target.split("+")[-1].split("/")[-1].strip()
                await client(ImportChatInviteRequest(invite_hash))
            else:
                from telethon.tl.functions.channels import JoinChannelRequest
                await client(JoinChannelRequest(target))
            return {"success": True, "data": {"joined": str_target}}

        elif task_type == "LEAVE_CHAT":
            from telethon.tl.functions.channels import LeaveChannelRequest
            await client(LeaveChannelRequest(target))
            return {"success": True, "data": {"left": str(target)}}

        elif task_type in ["REACTION", "EMOJI_REACTION"]:
            from telethon.tl.functions.messages import SendReactionRequest
            from telethon.tl.types import ReactionEmoji

            raw_target = str(target)
            msg_id = int(payload.get("messageId", 0))

            # Auto-parse t.me link if passed as target/chatId (e.g. https://t.me/ForPayoutRecords/728)
            if "t.me/" in raw_target:
                cleaned = raw_target.replace("https://", "").replace("http://", "").rstrip("/")
                parts = cleaned.split("/")
                if len(parts) >= 3 and parts[-1].isdigit():
                    target = parts[-2]
                    msg_id = int(parts[-1])
                elif len(parts) >= 2:
                    target = parts[-1]

            if not msg_id and payload.get("messageId"):
                msg_id = int(payload.get("messageId"))

            reaction = payload.get("reaction") or payload.get("emoji") or "👍"
            entity = await client.get_entity(target)

            await client(SendReactionRequest(peer=entity, msg_id=msg_id, reaction=[ReactionEmoji(emoticon=reaction)]))
            return {"success": True, "data": {"target": str(target), "messageId": msg_id, "reaction": reaction}}

        elif task_type == "GET_ADMINS":
            from telethon.tl.types import ChannelParticipantsAdmins
            admins = await client.get_participants(target, filter=ChannelParticipantsAdmins)
            return {"success": True, "data": {"admins": [{"id": a.id, "username": a.username} for a in admins]}}

        elif task_type == "GET_MEMBERS":
            limit = payload.get("limit", 50)
            members = await client.get_participants(target, limit=limit)
            return {"success": True, "data": {"members": [{"id": m.id, "username": m.username, "phone": m.phone} for m in members]}}

        elif task_type == "GET_CHAT_INFO":
            entity = await client.get_entity(target)
            return {"success": True, "data": {"id": entity.id, "title": getattr(entity, 'title', None)}}

        else:
            return {
                "success": False,
                "errorCode": ERROR_CODES["TASK_INVALID"],
                "errorMessage": f"Unsupported Telegram operation type: {task_type}"
            }

    except Exception as exc:
        err_code, err_msg, flood_sec = map_telethon_exception(exc)
        return {
            "success": False,
            "errorCode": err_code,
            "errorMessage": err_msg,
            "floodWaitSeconds": flood_sec
        }
    finally:
        if client.is_connected():
            await client.disconnect()


async def main():
    try:
        # Read payload from standard input or command line arg
        if len(sys.argv) > 1 and sys.argv[1] != "-":
            with open(sys.argv[1], "r", encoding="utf-8") as f:
                input_data = json.load(f)
        else:
            input_text = sys.stdin.read()
            if not input_text.strip():
                print(json.dumps({
                    "success": False,
                    "errorCode": ERROR_CODES["TASK_INVALID"],
                    "errorMessage": "Empty input provided to executor"
                }))
                sys.exit(1)
            input_data = json.loads(input_text)

        task_type = input_data.get("type", "")
        payload = input_data.get("payload", {})
        account = input_data.get("account", {})
        simulation_mode = input_data.get("simulation", False) or os.environ.get("TELEGRAM_SIMULATION_MODE", "false").lower() == "true"

        if simulation_mode or not account.get("sessionString"):
            result = await execute_simulated_operation(task_type, payload, account)
        else:
            result = await execute_telethon_operation(task_type, payload, account)

        print(json.dumps(result))
        sys.exit(0 if result.get("success") else 1)

    except Exception as e:
        err_code, err_msg, _ = map_telethon_exception(e)
        print(json.dumps({
            "success": False,
            "errorCode": err_code,
            "errorMessage": err_msg
        }))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
