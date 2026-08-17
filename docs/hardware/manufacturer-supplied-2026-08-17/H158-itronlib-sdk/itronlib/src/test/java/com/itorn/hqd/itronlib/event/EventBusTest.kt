package com.itorn.hqd.itronlib.event

import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.VMPenEventType
import org.junit.Assert.assertEquals
import org.junit.Test

class EventBusTest {
    @Test
    fun dispatch_notifiesOnlyMatchingType() {
        val bus = EventBus()
        val received = mutableListOf<BleEvent>()

        bus.addEventListener(VMPenEventType.ScanBleEvent) { received += it }
        bus.dispatch(BleEvent.ScanFinished)
        bus.dispatch(BleEvent.ConnectStatusChanged(com.itorn.hqd.itronlib.model.BleState.DisConnected))

        assertEquals(listOf(BleEvent.ScanFinished), received)
    }
}
