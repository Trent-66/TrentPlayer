"""Replay local main, keeping author dates and dropping the Cursor co-author line."""

from __future__ import annotations

import os
import subprocess

SOURCE = "main"
TARGET = "contributions"


def git(*args: str, env: dict[str, str] | None = None, input_text: str | None = None) -> str:
    result = subprocess.run(
        ["git", *args],
        input=input_text,
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout


def main() -> None:
    commits = [line for line in git("rev-list", "--reverse", SOURCE).splitlines() if line]
    mapping: dict[str, str] = {}

    for commit in commits:
        header, message = git(
            "log",
            "-1",
            "--format=%T%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%cn%x1f%ce%x1f%cd%x1e%B",
            "--date=raw",
            commit,
        ).split("\x1e", 1)
        tree, parents, author, email, authored, committer, committer_email, committed = header.split("\x1f")
        cleaned = "\n".join(
            line for line in message.splitlines() if "Co-authored-by: Cursor" not in line
        ).strip() + "\n"

        env = os.environ.copy()
        env.update(
            {
                "GIT_AUTHOR_NAME": author,
                "GIT_AUTHOR_EMAIL": email,
                "GIT_AUTHOR_DATE": authored,
                "GIT_COMMITTER_NAME": committer,
                "GIT_COMMITTER_EMAIL": committer_email,
                "GIT_COMMITTER_DATE": committed,
            }
        )
        args = ["commit-tree", tree]
        for parent in parents.split():
            args.extend(["-p", mapping[parent]])
        new_commit = git(*args, env=env, input_text=cleaned).strip()
        mapping[commit] = new_commit

    tip = mapping[commits[-1]]
    git("branch", "-f", TARGET, tip)
    print(tip)


if __name__ == "__main__":
    main()
