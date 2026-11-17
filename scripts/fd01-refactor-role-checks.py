#!/usr/bin/env python3
"""Replace `var.role === UserRole.X` with hasRole(var, UserRole.X) across apps/api/src."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "apps/api/src"
SKIP = {
    "common/effective-roles.ts",
    "common/rbac-role-check.node.test.ts",
}
SINGLE = re.compile(
    r"(?P<var>[A-Za-z_][A-Za-z0-9_]*)\.role\s*(?P<op>===|!==)\s*UserRole\.(?P<member>[A-Z_]+)"
)
OR_CHAIN = re.compile(
    r"(?P<var>[A-Za-z_][A-Za-z0-9_]*)\.role\s*===\s*UserRole\.(?P<a>[A-Z_]+)\s*\|\|\s*"
    r"(?P=var)\.role\s*===\s*UserRole\.(?P<b>[A-Z_]+)"
)
HAS_IMPORT = re.compile(r"from\s+[\"']\.\./common/effective-roles[\"']|from\s+[\"']\./effective-roles[\"']")


def ensure_import(text: str) -> str:
    if HAS_IMPORT.search(text):
        if "hasRole" in text and "hasAnyRole" not in text and "hasAnyRole(" in text:
            text = text.replace(
                "import { hasRole",
                "import { hasRole, hasAnyRole",
                1,
            )
        if "hasAnyRoleInSet" in text and "hasAnyRoleInSet" not in text.split("import", 1)[0]:
            pass
        return text
    # after last import from @prisma or nest
    lines = text.split("\n")
    insert_at = 0
    for i, line in enumerate(lines):
        if line.startswith("import "):
            insert_at = i + 1
    imp = 'import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";'
    # fix relative path depth
    depth = 0  # computed per file externally
    return text


def rel_import(path: Path) -> str:
    rel = path.relative_to(ROOT)
    depth = len(rel.parts) - 1
    prefix = "/".join([".."] * depth) if depth else "."
    return f'import {{ hasAnyRole, hasAnyRoleInSet, hasRole }} from "{prefix}/common/effective-roles";'


def transform_file(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in SKIP or rel.endswith(".node.test.ts"):
        return False
    text = path.read_text(encoding="utf-8")
    orig = text

    def or_repl(m: re.Match[str]) -> str:
        var, a, b = m.group("var"), m.group("a"), m.group("b")
        return f"hasAnyRole({var}, [UserRole.{a}, UserRole.{b}])"

    text = OR_CHAIN.sub(or_repl, text)

    def single_repl(m: re.Match[str]) -> str:
        var, op, member = m.group("var"), m.group("op"), m.group("member")
        call = f"hasRole({var}, UserRole.{member})"
        return call if op == "===" else f"!{call}"

    if SINGLE.search(text):
        text = SINGLE.sub(single_repl, text)

    # ORG / set has pattern: SET.has(x.role)
    text = re.sub(
        r"([A-Z_][A-Z0-9_]*)\.has\(([A-Za-z_][A-Za-z0-9_]*)\.role\)",
        r"hasAnyRoleInSet(\2, \1)",
        text,
    )

    if text == orig:
        return False

    if "hasRole(" in text or "hasAnyRole(" in text or "hasAnyRoleInSet(" in text:
        if not HAS_IMPORT.search(text):
            lines = text.split("\n")
            insert_at = 0
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    insert_at = i + 1
            lines.insert(insert_at, rel_import(path))
            text = "\n".join(lines)

    path.write_text(text, encoding="utf-8")
    return True


def main() -> int:
    changed = 0
    for path in sorted(ROOT.rglob("*.ts")):
        if path.name.endswith(".d.ts"):
            continue
        if transform_file(path):
            changed += 1
            print(path.relative_to(ROOT))
    print(f"Updated {changed} files", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())