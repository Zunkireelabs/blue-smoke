package com.itorn.hqd.itronlib

import android.app.Application
import android.bluetooth.BluetoothDevice
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.itorn.hqd.itronlib.config.BleSdkConfig
import com.itorn.hqd.itronlib.connection.BleConnectionManager
import com.itorn.hqd.itronlib.event.EventBus
import com.itorn.hqd.itronlib.event.EventListener
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.VMPenEventType
import com.itorn.hqd.itronlib.protocol.HexCodec
import com.itorn.hqd.itronlib.scan.BleScanner

class DeviceManager private constructor() {
    private val eventBus = EventBus()
    private var app: Application? = null
    private var config: BleSdkConfig = BleSdkConfig()
    private var scanner: BleScanner? = null
    private var connectionManager: BleConnectionManager? = null
    private var serviceBound = false
    private var serviceConnected = false
    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, service: IBinder) {
            serviceConnected = true
        }

        override fun onServiceDisconnected(name: ComponentName) {
            serviceConnected = false
        }
    }

    fun init(app: Application, config: BleSdkConfig = BleSdkConfig()) {
        releaseInternal(clearListeners = false)
        this.app = app
        this.config = config
        scanner = BleScanner(app, config, eventBus)
        connectionManager = BleConnectionManager(app, config, eventBus)
        bindService(app)
    }

    fun release() {
        releaseInternal(clearListeners = true)
    }

    private fun releaseInternal(clearListeners: Boolean) {
        scanner?.stopScan()
        connectionManager?.release()
        unbindService()
        if (clearListeners) {
            eventBus.clear()
        }
        scanner = null
        connectionManager = null
        app = null
    }

    fun isServiceConnect(): Boolean = serviceConnected

    fun scanBle() {
        scanner?.startScan() ?: dispatchNotInitialized()
    }

    fun stopScan() {
        scanner?.stopScan()
    }

    fun setScanNamePrefix(prefix: String?) {
        scanner?.scanNamePrefix = prefix
    }

    fun connectDevice(mac: String) {
        connectionManager?.connect(mac) ?: dispatchNotInitialized()
    }

    fun connectDevice(device: BluetoothDevice) {
        connectionManager?.connect(device) ?: dispatchNotInitialized()
    }

    fun disconnect(mac: String) {
        connectionManager?.disconnect(mac)
    }

    fun isConnected(): Boolean = connectionManager?.isConnected() == true

    fun readDeviceInfo() {
        connectionManager?.readDeviceInfo() ?: dispatchNotInitialized()
    }

    fun setChildLock(lock: Boolean) {
        connectionManager?.setChildLock(lock) ?: dispatchNotInitialized()
    }

    fun sendHex(hexText: String) {
        val bytes = HexCodec.decode(hexText).getOrElse {
            eventBus.dispatch(BleEvent.Error(it.message ?: "Invalid hex input", it))
            return
        }
        connectionManager?.send(bytes) ?: dispatchNotInitialized()
    }

    fun addEventListener(type: VMPenEventType, listener: EventListener) {
        eventBus.addEventListener(type, listener)
    }

    fun removeEventListener(type: VMPenEventType, listener: EventListener) {
        eventBus.removeEventListener(type, listener)
    }

    private fun dispatchNotInitialized() {
        eventBus.dispatch(BleEvent.Error("DeviceManager is not initialized"))
    }

    private fun bindService(app: Application) {
        serviceConnected = false
        val intent = Intent(app, ItronBleService::class.java)
        val bound = app.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        serviceBound = bound
        if (!bound) {
            eventBus.dispatch(BleEvent.Error("BLE service binding failed"))
        }
    }

    private fun unbindService() {
        val boundApp = app
        if (serviceBound && boundApp != null) {
            runCatching {
                boundApp.unbindService(serviceConnection)
            }
        }
        serviceBound = false
        serviceConnected = false
    }

    companion object {
        private val INSTANCE = DeviceManager()

        fun getInstance(): DeviceManager = INSTANCE
    }
}
