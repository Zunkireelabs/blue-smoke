package com.itorn.hqd.itronlib.scan

import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleScanDevice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanResultStoreTest {
    @Test
    fun upsert_replacesExistingDeviceByMacAndKeepsLatestRssi() {
        val store = ScanResultStore()

        store.upsert(BleScanDevice(name = "HQD", mac = "AA:BB", rssi = -70))
        val devices = store.upsert(BleScanDevice(name = "HQD", mac = "AA:BB", rssi = -51))

        assertEquals(1, devices.size)
        assertEquals(-51, devices.single().rssi)
    }

    @Test
    fun upsert_keepsFirstSeenOrderWhenRssiChanges() {
        val store = ScanResultStore()

        store.upsert(BleScanDevice(name = "First", mac = "AA:BB", rssi = -80))
        store.upsert(BleScanDevice(name = "Second", mac = "CC:DD", rssi = -40))
        val devices = store.upsert(BleScanDevice(name = "First", mac = "AA:BB", rssi = -30))

        assertEquals(listOf("AA:BB", "CC:DD"), devices.map { it.mac })
        assertEquals(-30, devices.first().rssi)
    }

    @Test
    fun visibleDeviceName_filtersUnnamedDevices() {
        assertNull(BleScanner.visibleDeviceName(null, null))
        assertNull(BleScanner.visibleDeviceName("  ", null))
        assertNull(BleScanner.visibleDeviceName("Unknown", null))
    }

    @Test
    fun visibleDeviceName_prefersDeviceNameThenScanRecordName() {
        assertEquals("HQD", BleScanner.visibleDeviceName("HQD", "Fallback"))
        assertEquals("Fallback", BleScanner.visibleDeviceName(null, "Fallback"))
    }

    @Test
    fun missingPermissionMessage_reportsConnectPermissionAccurately() {
        val message = BleScanner.missingPermissionMessage(
            hasScanPermission = true,
            hasConnectPermission = false,
        )

        assertEquals("Bluetooth connect permission is missing", message)
    }

    @Test
    fun missingPermissionMessage_returnsNullWhenAllPermissionsGranted() {
        val message = BleScanner.missingPermissionMessage(
            hasScanPermission = true,
            hasConnectPermission = true,
        )

        assertNull(message)
    }

    @Test
    fun matchesScanFilter_keepsOnlyPrefixMatches() {
        assertTrue(BleScanner.matchesScanFilter("YP65-AT", "YP65-AT"))
        assertTrue(BleScanner.matchesScanFilter("yp65-at", "YP65-AT"))
        assertFalse(BleScanner.matchesScanFilter("HQD", "YP65-AT"))
    }

    @Test
    fun matchesScanFilter_allowsAllWhenPrefixMissing() {
        assertTrue(BleScanner.matchesScanFilter("HQD", null))
        assertTrue(BleScanner.matchesScanFilter("HQD", ""))
    }

    @Test
    fun scanResult_defaultsDevicesToSingleDeviceForCompatibility() {
        val device = BleScanDevice(name = "HQD", mac = "AA:BB", rssi = -60)

        val event = BleEvent.ScanResult(device)

        assertEquals(device, event.device)
        assertEquals(listOf(device), event.devices)
    }

    @Test
    fun scanResult_canExposeDeduplicatedSnapshot() {
        val first = BleScanDevice(name = "HQD-1", mac = "AA:BB", rssi = -50)
        val second = BleScanDevice(name = "HQD-2", mac = "CC:DD", rssi = -65)

        val event = BleEvent.ScanResult(first, listOf(first, second))

        assertEquals(first, event.device)
        assertEquals(listOf(first, second), event.devices)
    }
}
