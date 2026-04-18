"""Stub: forwards to the real script at repo root."""
import runpy, pathlib  # noqa: E401
runpy.run_path(str(pathlib.Path(__file__).parent.parent.parent / "scripts" / "gen_test_manifest.py"), run_name="__main__")
