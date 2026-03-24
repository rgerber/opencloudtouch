"""Tests for TuneIn Radio Provider — TDD RED phase."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from opencloudtouch.radio.providers.tunein import (
    TuneInConnectionError,
    TuneInError,
    TuneInProvider,
    TuneInStation,
    TuneInTimeoutError,
)

# ---------------------------------------------------------------------------
# Sample OPML responses from TuneIn API
# ---------------------------------------------------------------------------

SEARCH_RESPONSE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<opml version="1">
    <head><title>Search Results: absolut relax</title><status>200</status></head>
    <body>
        <outline type="audio" text="Absolut relax"
            URL="http://opml.radiotime.com/Tune.ashx?id=s158432"
            bitrate="128" reliability="90" guide_id="s158432"
            subtext="Entspannt durch den Tag" genre_id="g10" formats="mp3"
            item="station"
            image="http://cdn-profiles.tunein.com/s158432/images/logoq.png?t=2"
            now_playing_id="s158432" preset_id="s158432"/>
        <outline type="audio" text="Absolut TOP"
            URL="http://opml.radiotime.com/Tune.ashx?id=s309947"
            bitrate="128" reliability="95" guide_id="s309947"
            subtext="Die besten Hits" genre_id="g61" formats="mp3"
            item="station"
            image="http://cdn-profiles.tunein.com/s309947/images/logoq.png?t=1"
            now_playing_id="s309947" preset_id="s309947"/>
        <outline type="link" text="Some Podcast"
            URL="http://opml.radiotime.com/Tune.ashx?c=pbrowse&amp;id=p123"
            guide_id="p123" item="show"/>
    </body>
</opml>"""

DESCRIBE_RESPONSE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<opml version="1">
    <head><status>200</status></head>
    <body>
        <outline type="object" text="Absolut relax">
            <station>
                <guide_id>s158432</guide_id>
                <name>Absolut relax</name>
                <slogan>Entspannt durch den Tag</slogan>
                <url>https://absolutradio.de/relax</url>
                <logo>https://cdn-profiles.tunein.com/s158432/images/logoq.png</logo>
                <location>Germany</location>
                <language>German</language>
                <genre_name>Easy Listening</genre_name>
            </station>
        </outline>
    </body>
</opml>"""

EMPTY_SEARCH_XML = """<?xml version="1.0" encoding="UTF-8"?>
<opml version="1">
    <head><title>Search Results: xyznonexistent</title><status>200</status></head>
    <body></body>
</opml>"""

DESCRIBE_NOT_FOUND_XML = """<?xml version="1.0" encoding="UTF-8"?>
<opml version="1">
    <head><status>200</status></head>
    <body></body>
</opml>"""


# ===========================================================================
# TuneInStation dataclass tests
# ===========================================================================


class TestTuneInStation:
    """Tests for TuneInStation internal data model."""

    def test_from_search_outline(self):
        """Parse a station from search result OPML outline attributes."""
        attrs = {
            "text": "Absolut relax",
            "guide_id": "s158432",
            "image": "http://cdn-profiles.tunein.com/s158432/images/logoq.png",
            "bitrate": "128",
            "subtext": "Entspannt durch den Tag",
            "genre_id": "g10",
            "formats": "mp3",
            "item": "station",
        }
        station = TuneInStation.from_search_outline(attrs)

        assert station.guide_id == "s158432"
        assert station.name == "Absolut relax"
        assert (
            station.image == "http://cdn-profiles.tunein.com/s158432/images/logoq.png"
        )
        assert station.bitrate == 128
        assert station.subtext == "Entspannt durch den Tag"
        assert station.genre_id == "g10"
        assert station.formats == "mp3"

    def test_from_search_outline_minimal(self):
        """Parse station with only required attributes."""
        attrs = {"text": "Minimal", "guide_id": "s999"}
        station = TuneInStation.from_search_outline(attrs)

        assert station.guide_id == "s999"
        assert station.name == "Minimal"
        assert station.image is None
        assert station.bitrate is None

    def test_from_search_outline_non_numeric_bitrate(self):
        """Non-numeric bitrate should become None."""
        attrs = {"text": "Test", "guide_id": "s1", "bitrate": "N/A"}
        station = TuneInStation.from_search_outline(attrs)
        assert station.bitrate is None

    def test_to_unified(self):
        """Convert TuneInStation to unified RadioStation model."""
        station = TuneInStation(
            guide_id="s158432",
            name="Absolut relax",
            image="http://example.com/logo.png",
            bitrate=128,
            subtext="Entspannt",
            genre_id="g10",
            formats="mp3",
        )
        unified = station.to_unified()

        assert unified.station_id == "s158432"
        assert unified.name == "Absolut relax"
        assert unified.url == ""
        assert unified.favicon == "http://example.com/logo.png"
        assert unified.bitrate == 128
        assert unified.codec == "mp3"
        assert unified.provider == "tunein"
        assert unified.tags == ["Easy Listening"]

    def test_to_unified_unknown_genre(self):
        """Unknown genre_id maps to the ID string itself."""
        station = TuneInStation(guide_id="s1", name="Test", genre_id="g99999")
        unified = station.to_unified()
        assert unified.tags == ["g99999"]

    def test_to_unified_no_genre(self):
        """No genre_id → tags is None."""
        station = TuneInStation(guide_id="s1", name="Test")
        unified = station.to_unified()
        assert unified.tags is None


# ===========================================================================
# TuneInProvider tests
# ===========================================================================


class TestTuneInProvider:
    """Tests for TuneInProvider adapter."""

    def test_provider_name(self):
        provider = TuneInProvider()
        assert provider.provider_name == "tunein"

    def test_init_defaults(self):
        provider = TuneInProvider()
        assert provider.timeout == 10.0

    def test_init_custom_timeout(self):
        provider = TuneInProvider(timeout=5.0)
        assert provider.timeout == 5.0


class TestTuneInProviderSearch:
    """Tests for search methods."""

    @pytest.fixture
    def provider(self):
        return TuneInProvider(timeout=5.0)

    @pytest.mark.asyncio
    async def test_search_by_name(self, provider):
        """Search returns parsed stations, excludes non-station items."""
        mock_response = MagicMock()
        mock_response.text = SEARCH_RESPONSE_XML
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(return_value=mock_response)
            mock_client_fn.return_value = client

            results = await provider.search_by_name("Absolut Relax", limit=10)

        assert len(results) == 2  # 2 stations, podcast excluded
        assert results[0].station_id == "s158432"
        assert results[0].name == "Absolut relax"
        assert results[0].provider == "tunein"
        assert results[1].station_id == "s309947"

    @pytest.mark.asyncio
    async def test_search_by_name_empty(self, provider):
        """Empty search returns empty list."""
        mock_response = MagicMock()
        mock_response.text = EMPTY_SEARCH_XML
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(return_value=mock_response)
            mock_client_fn.return_value = client

            results = await provider.search_by_name("xyznonexistent")

        assert results == []

    @pytest.mark.asyncio
    async def test_search_by_name_respects_limit(self, provider):
        """Limit parameter caps the number of returned stations."""
        mock_response = MagicMock()
        mock_response.text = SEARCH_RESPONSE_XML
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(return_value=mock_response)
            mock_client_fn.return_value = client

            results = await provider.search_by_name("Absolut", limit=1)

        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_search_by_name_timeout(self, provider):
        """Timeout raises TuneInTimeoutError."""
        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            mock_client_fn.return_value = client

            with pytest.raises(TuneInTimeoutError, match="timed out"):
                await provider.search_by_name("test")

    @pytest.mark.asyncio
    async def test_search_by_name_connection_error(self, provider):
        """Connection error raises TuneInConnectionError."""
        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
            mock_client_fn.return_value = client

            with pytest.raises(TuneInConnectionError, match="Connection failed"):
                await provider.search_by_name("test")

    @pytest.mark.asyncio
    async def test_search_by_tag(self, provider):
        """Search by tag/genre works."""
        mock_response = MagicMock()
        mock_response.text = SEARCH_RESPONSE_XML
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(return_value=mock_response)
            mock_client_fn.return_value = client

            results = await provider.search_by_tag("rock")

        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_search_by_country(self, provider):
        """Search by country works (uses keyword filter)."""
        mock_response = MagicMock()
        mock_response.text = SEARCH_RESPONSE_XML
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(return_value=mock_response)
            mock_client_fn.return_value = client

            results = await provider.search_by_country("Germany")

        assert len(results) >= 1


class TestTuneInProviderStationDetail:
    """Tests for get_station_by_uuid (Describe API)."""

    @pytest.fixture
    def provider(self):
        return TuneInProvider(timeout=5.0)

    @pytest.mark.asyncio
    async def test_get_station_by_uuid(self, provider):
        """Get station detail by ID."""
        mock_response = MagicMock()
        mock_response.text = DESCRIBE_RESPONSE_XML
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(return_value=mock_response)
            mock_client_fn.return_value = client

            station = await provider.get_station_by_uuid("s158432")

        assert station.station_id == "s158432"
        assert station.name == "Absolut relax"
        assert station.country == "Germany"
        assert station.homepage == "https://absolutradio.de/relax"
        assert station.provider == "tunein"

    @pytest.mark.asyncio
    async def test_get_station_not_found(self, provider):
        """Non-existent station raises TuneInError."""
        mock_response = MagicMock()
        mock_response.text = DESCRIBE_NOT_FOUND_XML
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(return_value=mock_response)
            mock_client_fn.return_value = client

            with pytest.raises(TuneInError, match="not found"):
                await provider.get_station_by_uuid("s000000")

    @pytest.mark.asyncio
    async def test_get_station_timeout(self, provider):
        """Timeout on describe raises TuneInTimeoutError."""
        with patch.object(provider, "_get_client") as mock_client_fn:
            client = AsyncMock()
            client.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            mock_client_fn.return_value = client

            with pytest.raises(TuneInTimeoutError):
                await provider.get_station_by_uuid("s158432")


class TestTuneInProviderClient:
    """Tests for HTTP client lifecycle."""

    def test_get_client_creates_client(self):
        provider = TuneInProvider()
        client = provider._get_client()
        assert isinstance(client, httpx.AsyncClient)

    def test_get_client_reuses_client(self):
        provider = TuneInProvider()
        client1 = provider._get_client()
        client2 = provider._get_client()
        assert client1 is client2

    @pytest.mark.asyncio
    async def test_close_client(self):
        provider = TuneInProvider()
        _ = provider._get_client()
        await provider.close()
        assert provider._client is None
