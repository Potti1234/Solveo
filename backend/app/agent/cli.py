from __future__ import annotations

import argparse
import json

from app.agent.runner import run_case_for_message
from app.db import init_db


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("message_id", nargs="?", default="msg_ac_302")
    args = parser.parse_args()
    init_db()
    result = run_case_for_message(args.message_id)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
