package com.itorn.hqd.itronlib

import com.itorn.hqd.itronlib.event.EventListener
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.VMPenEventType
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class DeviceManagerTest {
    @After
    fun tearDown() {
        DeviceManager.getInstance().release()
    }

    @Test
    fun getInstance_returnsSingleton() {
        assertSame(DeviceManager.getInstance(), DeviceManager.getInstance())
    }

    @Test
    fun isServiceConnect_beforeInit_returnsFalse() {
        assertFalse(DeviceManager.getInstance().isServiceConnect())
    }

    @Test
    fun scanBle_beforeInit_dispatchesNotInitializedError() {
        val manager = DeviceManager.getInstance()
        val events = mutableListOf<BleEvent>()
        val listener = EventListener { events += it }
        manager.addEventListener(VMPenEventType.ErrorEvent, listener)

        manager.scanBle()

        assertEquals("DeviceManager is not initialized", (events.single() as BleEvent.Error).message)
    }

    @Test
    fun sendHex_invalidInput_dispatchesHexError() {
        val manager = DeviceManager.getInstance()
        val events = mutableListOf<BleEvent>()
        val listener = EventListener { events += it }
        manager.addEventListener(VMPenEventType.ErrorEvent, listener)

        manager.sendHex("0A 1")

        assertEquals("Hex input must contain an even number of characters", (events.single() as BleEvent.Error).message)
    }
}
