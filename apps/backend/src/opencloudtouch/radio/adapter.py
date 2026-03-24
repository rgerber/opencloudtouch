"""
Radio Provider Factory.

Factory pattern for Mock vs Real radio provider selection.
Based on OCT_MOCK_MODE environment variable.
Uses singleton pattern for real adapters to enable connection pooling.
"""

import logging
import os

from opencloudtouch.radio.provider import RadioProvider

logger = logging.getLogger(__name__)

# Singleton instances for connection pooling and DNS caching
_radio_adapter_instance: RadioProvider | None = None
_tunein_adapter_instance: RadioProvider | None = None


def get_radio_adapter(provider: str = "radiobrowser") -> RadioProvider:
    """
    Factory function: Select radio provider by name.

    Returns a singleton instance to reuse httpx connections and DNS cache.

    Args:
        provider: Provider name - "radiobrowser" (default) or "tunein"

    Returns:
        RadioProvider: MockRadioAdapter if OCT_MOCK_MODE=true, else requested provider
    """
    global _radio_adapter_instance, _tunein_adapter_instance

    mock_mode = os.getenv("OCT_MOCK_MODE", "false").lower() == "true"

    if mock_mode:
        logger.debug("[FACTORY] Creating MockRadioAdapter (OCT_MOCK_MODE=true)")
        from opencloudtouch.radio.providers.mock import MockRadioAdapter

        return MockRadioAdapter()

    if provider == "tunein":
        if _tunein_adapter_instance is None:
            logger.info("[FACTORY] Creating TuneInProvider singleton")
            from opencloudtouch.radio.providers.tunein import TuneInProvider

            _tunein_adapter_instance = TuneInProvider()
        return _tunein_adapter_instance

    # Default: radiobrowser
    if _radio_adapter_instance is None:
        logger.info("[FACTORY] Creating RadioBrowserAdapter singleton")
        from opencloudtouch.radio.providers.radiobrowser import RadioBrowserAdapter

        _radio_adapter_instance = RadioBrowserAdapter()

    return _radio_adapter_instance


def reset_radio_adapter() -> None:
    """Reset all singletons (for testing)."""
    global _radio_adapter_instance, _tunein_adapter_instance
    _radio_adapter_instance = None
    _tunein_adapter_instance = None
