"""One advisory update lock shared by migrations and scheduler writes."""
from contextlib import contextmanager
import fcntl
from pathlib import Path
import threading

_locks = {}
_guard = threading.Lock()
_held = threading.local()


@contextmanager
def database_lock(path):
    if not path:
        yield
        return
    key = str(Path(path).resolve())
    with _guard:
        mutex = _locks.setdefault(key, threading.RLock())
    with mutex:
        held = getattr(_held, "paths", set())
        if key in held:
            yield
            return
        Path(key).parent.mkdir(parents=True, exist_ok=True)
        with open(key + ".update.lock", "a") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            _held.paths = held | {key}
            try:
                yield
            finally:
                _held.paths = held
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
