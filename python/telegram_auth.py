#!/usr/bin/env python3
"""
TeleSpark Telegram Authentication Bridge.
Handles interactive Telegram MTProto login flows via HTTP API:
- send_code: Dispatches OTP to phone and returns phone_code_hash + temporary session
- verify_code: Verifies OTP (+ optional 2FA password) and returns permanent StringSession
- test_session: Validates if an existing session string is alive on Telegram
"""

import sys
import json
import asyncio
import os
from typing import Dict, Any

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PhoneNumberInvalidError,
    PhoneNumberBannedError,
    FloodWaitError,
    UserDeactivatedError,
    AuthKeyUnregisteredError,
)

# Ensure UTF-8 I/O
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


async def handle_send_code(payload: Dict[str, Any]) -> Dict[str, Any]:
    phone = payload.get("phone", "").strip()
    api_id = int(payload.get("apiId") or os.environ.get("TELEGRAM_API_ID", 0))
    api_hash = payload.get("apiHash") or os.environ.get("TELEGRAM_API_HASH", "")

    if not phone:
        return {"success": False, "errorCode": "INVALID_PHONE", "errorMessage": "Phone number is required"}
    if not api_id or not api_hash:
        return {"success": False, "errorCode": "MISSING_API_CREDENTIALS", "errorMessage": "Telegram API ID and Hash are required"}

    client = TelegramClient(StringSession(), api_id, api_hash)
    try:
        await client.connect()
        res = await client.send_code_request(phone)
        temp_session = client.session.save()
        return {
            "success": True,
            "phone": phone,
            "phoneCodeHash": res.phone_code_hash,
            "tempSession": temp_session,
            "timeout": getattr(res, "timeout", 300)
        }
    except PhoneNumberInvalidError:
        return {"success": False, "errorCode": "PHONE_INVALID", "errorMessage": "The phone number is invalid"}
    except PhoneNumberBannedError:
        return {"success": False, "errorCode": "PHONE_BANNED", "errorMessage": "This phone number has been banned by Telegram"}
    except FloodWaitError as e:
        return {"success": False, "errorCode": "FLOOD_WAIT", "errorMessage": f"FloodWait from Telegram: please wait {e.seconds} seconds", "floodWaitSeconds": e.seconds}
    except Exception as e:
        return {"success": False, "errorCode": "AUTH_ERROR", "errorMessage": str(e)}
    finally:
        if client.is_connected():
            await client.disconnect()


async def handle_verify_code(payload: Dict[str, Any]) -> Dict[str, Any]:
    phone = payload.get("phone", "").strip()
    code = payload.get("code", "").strip()
    phone_code_hash = payload.get("phoneCodeHash", "").strip()
    password = payload.get("password")
    temp_session = payload.get("tempSession", "").strip()
    api_id = int(payload.get("apiId") or os.environ.get("TELEGRAM_API_ID", 0))
    api_hash = payload.get("apiHash") or os.environ.get("TELEGRAM_API_HASH", "")

    if not phone or not code:
        return {"success": False, "errorCode": "INVALID_INPUT", "errorMessage": "Phone number and verification code are required"}
    if not temp_session:
        return {"success": False, "errorCode": "SESSION_EXPIRED", "errorMessage": "Login session expired. Please request a new code"}

    client = TelegramClient(StringSession(temp_session), api_id, api_hash)
    try:
        await client.connect()

        try:
            await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if not password:
                # Tell frontend 2FA is needed
                return {
                    "success": False,
                    "requires2FA": True,
                    "errorCode": "2FA_REQUIRED",
                    "errorMessage": "Two-Step Verification (2FA) cloud password is required",
                    "tempSession": client.session.save()
                }
            # Attempt 2FA login
            await client.sign_in(password=password)

        me = await client.get_me()
        session_string = client.session.save()

        return {
            "success": True,
            "sessionString": session_string,
            "user": {
                "id": me.id,
                "firstName": me.first_name,
                "lastName": me.last_name,
                "username": me.username,
                "phone": me.phone or phone
            }
        }
    except PhoneCodeInvalidError:
        return {"success": False, "errorCode": "CODE_INVALID", "errorMessage": "Invalid verification code"}
    except PhoneCodeExpiredError:
        return {"success": False, "errorCode": "CODE_EXPIRED", "errorMessage": "The verification code has expired. Please request a new code"}
    except FloodWaitError as e:
        return {"success": False, "errorCode": "FLOOD_WAIT", "errorMessage": f"Telegram FloodWait: wait {e.seconds}s", "floodWaitSeconds": e.seconds}
    except Exception as e:
        return {"success": False, "errorCode": "VERIFICATION_ERROR", "errorMessage": str(e)}
    finally:
        if client.is_connected():
            await client.disconnect()


async def handle_test_session(payload: Dict[str, Any]) -> Dict[str, Any]:
    session_string = payload.get("sessionString", "").strip()
    api_id = int(payload.get("apiId") or os.environ.get("TELEGRAM_API_ID", 0))
    api_hash = payload.get("apiHash") or os.environ.get("TELEGRAM_API_HASH", "")

    if not session_string:
        return {"success": False, "valid": False, "errorCode": "NO_SESSION", "errorMessage": "Missing sessionString"}

    client = TelegramClient(StringSession(session_string), api_id, api_hash)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            return {"success": True, "valid": False, "status": "REVOKED", "errorMessage": "Session is no longer authorized"}

        me = await client.get_me()
        return {
            "success": True,
            "valid": True,
            "status": "ACTIVE",
            "user": {
                "id": me.id,
                "firstName": me.first_name,
                "username": me.username,
                "phone": me.phone
            }
        }
    except (UserDeactivatedError, AuthKeyUnregisteredError):
        return {"success": True, "valid": False, "status": "DEACTIVATED", "errorMessage": "Account or session deactivated by Telegram"}
    except Exception as e:
        return {"success": False, "valid": False, "errorCode": "TEST_FAILED", "errorMessage": str(e)}
    finally:
        if client.is_connected():
            await client.disconnect()


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "errorMessage": "Missing action argument (send_code | verify_code | test_session)"}))
        sys.exit(1)

    action = sys.argv[1]
    input_text = sys.stdin.read()
    payload = json.loads(input_text) if input_text.strip() else {}

    if action == "send_code":
        result = await handle_send_code(payload)
    elif action == "verify_code":
        result = await handle_verify_code(payload)
    elif action == "test_session":
        result = await handle_test_session(payload)
    else:
        result = {"success": False, "errorMessage": f"Unknown action: {action}"}

    print(json.dumps(result))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    asyncio.run(main())
