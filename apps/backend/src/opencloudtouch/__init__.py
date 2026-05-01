"""OpenCloudTouch Backend Package"""

from importlib.metadata import version, PackageNotFoundError

try:
    __version__ = version("opencloudtouch")
except PackageNotFoundError:
    __version__ = "0.0.0"  # fallback when package is not installed
