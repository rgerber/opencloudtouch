"""Unit tests for BoseDeviceClientAdapter zone methods."""

from unittest.mock import MagicMock, patch

import pytest

from opencloudtouch.core.exceptions import DeviceConnectionError
from opencloudtouch.devices.client_adapter import BoseDeviceClientAdapter
from opencloudtouch.zones.models import ZoneMemberInfo, ZoneStatus


def _make_client(base_url: str = "http://192.168.1.100:8090"):
    """Create BoseDeviceClientAdapter with mocked BoseClient."""
    with patch("opencloudtouch.devices.client_adapter.SoundTouchDevice"), patch(
        "opencloudtouch.devices.client_adapter.BoseClient"
    ):
        return BoseDeviceClientAdapter(base_url)


def _make_mock_zone(
    master_id="DEV001", master_ip="192.168.1.100", members=None, is_master=True
):
    """Create a mock bosesoundtouchapi Zone object."""
    zone = MagicMock()
    zone.MasterDeviceId = master_id
    zone.MasterIpAddress = master_ip
    zone.IsZoneMaster = is_master
    if members is None:
        m1 = MagicMock()
        m1.DeviceId = master_id
        m1.IpAddress = master_ip
        m2 = MagicMock()
        m2.DeviceId = "DEV002"
        m2.IpAddress = "192.168.1.101"
        zone.Members = [m1, m2]
    else:
        zone.Members = members
    return zone


class TestGetZoneStatus:
    """Tests for get_zone_status."""

    @pytest.mark.asyncio
    async def test_returns_zone_status(self):
        """Returns ZoneStatus when device is in a zone."""
        client = _make_client()
        zone = _make_mock_zone()
        client._client.GetZoneStatus.return_value = zone

        result = await client.get_zone_status()

        assert isinstance(result, ZoneStatus)
        assert result.master_id == "DEV001"
        assert result.is_master is True
        assert len(result.members) == 2

    @pytest.mark.asyncio
    async def test_returns_none_when_no_zone(self):
        """Returns None when device is not in a zone."""
        client = _make_client()
        zone = MagicMock()
        zone.MasterDeviceId = None
        client._client.GetZoneStatus.return_value = zone

        result = await client.get_zone_status()
        assert result is None

    @pytest.mark.asyncio
    async def test_raises_connection_error_on_failure(self):
        """Raises DeviceConnectionError when client fails."""
        client = _make_client()
        client._client.GetZoneStatus.side_effect = Exception("Connection refused")

        with pytest.raises(DeviceConnectionError):
            await client.get_zone_status()

    @pytest.mark.asyncio
    async def test_members_have_correct_roles(self):
        """Master member has role 'master', others have 'slave'."""
        client = _make_client()
        zone = _make_mock_zone()
        client._client.GetZoneStatus.return_value = zone

        result = await client.get_zone_status()
        roles = {m.device_id: m.role for m in result.members}
        assert roles["DEV001"] == "master"
        assert roles["DEV002"] == "slave"

    @pytest.mark.asyncio
    async def test_master_always_in_members_when_missing(self):
        """Master is auto-inserted when device returns members without master."""
        client = _make_client()
        # Simulate slave-only response (some SoundTouch firmwares omit master)
        slave = MagicMock()
        slave.DeviceId = "DEV002"
        slave.IpAddress = "192.168.1.101"
        zone = _make_mock_zone(members=[slave])
        client._client.GetZoneStatus.return_value = zone

        result = await client.get_zone_status()
        assert len(result.members) == 2
        ids = {m.device_id for m in result.members}
        assert "DEV001" in ids
        assert "DEV002" in ids
        master_member = next(m for m in result.members if m.device_id == "DEV001")
        assert master_member.role == "master"
        assert result.members[0].device_id == "DEV001"  # master is first


class TestCreateZone:
    """Tests for create_zone."""

    @pytest.mark.asyncio
    async def test_creates_zone_successfully(self):
        """Creates zone and returns status."""
        client = _make_client()
        client._client.Device.DeviceId = "DEV001"
        zone = _make_mock_zone()
        client._client.GetZoneStatus.return_value = zone

        members = [
            ZoneMemberInfo(device_id="DEV002", ip_address="192.168.1.101", role="slave")
        ]
        result = await client.create_zone("192.168.1.100", members)

        assert isinstance(result, ZoneStatus)
        client._client.CreateZone.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_connection_error_on_failure(self):
        """Raises DeviceConnectionError when create fails."""
        client = _make_client()
        client._client.Device.DeviceId = "DEV001"
        client._client.CreateZone.side_effect = Exception("Timeout")

        members = [
            ZoneMemberInfo(device_id="DEV002", ip_address="192.168.1.101", role="slave")
        ]
        with pytest.raises(DeviceConnectionError):
            await client.create_zone("192.168.1.100", members)


class TestAddZoneMembers:
    """Tests for add_zone_members."""

    @pytest.mark.asyncio
    async def test_adds_members_successfully(self):
        """Calls AddZoneMembers on underlying client."""
        client = _make_client()
        members = [
            ZoneMemberInfo(device_id="DEV003", ip_address="192.168.1.102", role="slave")
        ]

        await client.add_zone_members(members)
        client._client.AddZoneMembers.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_connection_error_on_failure(self):
        """Raises DeviceConnectionError when add fails."""
        client = _make_client()
        client._client.AddZoneMembers.side_effect = Exception("Error")

        members = [
            ZoneMemberInfo(device_id="DEV003", ip_address="192.168.1.102", role="slave")
        ]
        with pytest.raises(DeviceConnectionError):
            await client.add_zone_members(members)


class TestRemoveZoneMembers:
    """Tests for remove_zone_members."""

    @pytest.mark.asyncio
    async def test_removes_members_successfully(self):
        """Calls RemoveZoneMembers on underlying client."""
        client = _make_client()
        members = [
            ZoneMemberInfo(device_id="DEV002", ip_address="192.168.1.101", role="slave")
        ]

        await client.remove_zone_members(members)
        client._client.RemoveZoneMembers.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_connection_error_on_failure(self):
        """Raises DeviceConnectionError when remove fails."""
        client = _make_client()
        client._client.RemoveZoneMembers.side_effect = Exception("Error")

        members = [
            ZoneMemberInfo(device_id="DEV002", ip_address="192.168.1.101", role="slave")
        ]
        with pytest.raises(DeviceConnectionError):
            await client.remove_zone_members(members)


class TestRemoveZone:
    """Tests for remove_zone."""

    @pytest.mark.asyncio
    async def test_removes_zone_successfully(self):
        """Calls RemoveZone on underlying client."""
        client = _make_client()

        await client.remove_zone()
        client._client.RemoveZone.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_connection_error_on_failure(self):
        """Raises DeviceConnectionError when remove fails."""
        client = _make_client()
        client._client.RemoveZone.side_effect = Exception("Error")

        with pytest.raises(DeviceConnectionError):
            await client.remove_zone()
