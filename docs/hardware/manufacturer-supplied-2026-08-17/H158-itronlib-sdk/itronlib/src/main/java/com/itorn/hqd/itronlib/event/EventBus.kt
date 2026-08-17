package com.itorn.hqd.itronlib.event

import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.VMPenEventType
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

fun interface EventListener {
    fun performed(event: BleEvent)
}

class EventBus {
    private val listeners = ConcurrentHashMap<VMPenEventType, CopyOnWriteArrayList<EventListener>>()

    fun addEventListener(type: VMPenEventType, listener: EventListener) {
        listeners.getOrPut(type) { CopyOnWriteArrayList() }.add(listener)
    }

    fun removeEventListener(type: VMPenEventType, listener: EventListener) {
        listeners[type]?.remove(listener)
    }

    fun clear() {
        listeners.clear()
    }

    fun dispatch(event: BleEvent) {
        listeners[event.type].orEmpty().forEach { it.performed(event) }
    }
}
