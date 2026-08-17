package com.itorn.hqd.itronlib.connection

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.itorn.hqd.itronlib.config.BleSdkConfig
import com.itorn.hqd.itronlib.event.EventBus
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleState
import com.itorn.hqd.itronlib.protocol.BleProtocol
import com.itorn.hqd.itronlib.protocol.HexCodec
import java.util.UUID

internal class ReconnectPolicy(private val maxAttempts: Int) {
    private var attempts = 0

    fun shouldRetry(): Boolean {
        if (attempts >= maxAttempts) {
            return false
        }
        attempts += 1
        return true
    }

    fun reset() {
        attempts = 0
    }
}

internal class BleConnectionManager(
    private val context: Context,
    private val config: BleSdkConfig,
    private val eventBus: EventBus,
) {
    private val reconnectPolicy = ReconnectPolicy(maxAttempts = 1)

    private var gatt: BluetoothGatt? = null
    private var connectedMac: String? = null
    private var writeCharacteristic: BluetoothGattCharacteristic? = null
    private var notifyCharacteristic: BluetoothGattCharacteristic? = null
    private var communicationReady = false
    private var pendingWriteHex: String? = null
    private var connectRetryCount = 0
    // 扫描回调传入的原始 BluetoothDevice，保留正确的地址类型（随机/公共），
    // 避免 getRemoteDevice(mac) 重建对象丢失地址类型导致 status=133
    private var connectedDevice: BluetoothDevice? = null

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (!isActiveGatt(gatt)) {
                return
            }
            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (communicationReady) {
                    handleDisconnected(gatt, allowReconnect = true)
                } else {
                    // 首次连接失败（常见 status=133）：关闭旧 GATT 后有限次重试，
                    // 部分机型（如华为）首次 connectGatt 必然失败、重连即成功
                    val mac = connectedMac
                    if (mac != null && connectRetryCount < MAX_CONNECT_RETRIES) {
                        connectRetryCount += 1
                        eventBus.dispatch(
                            BleEvent.ConnectStatusChanged(
                                BleState.Connecting,
                                "Retrying connection ($connectRetryCount/$MAX_CONNECT_RETRIES, status=$status)",
                            ),
                        )
                        connect(mac, device = connectedDevice, resetReconnectPolicy = true)
                    } else {
                        eventBus.dispatch(BleEvent.Error("GATT connection failed: $status"))
                        failConnection(gatt)
                    }
                }
                return
            }
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                eventBus.dispatch(
                    BleEvent.ConnectStatusChanged(BleState.Connecting, "Discovering services"),
                )
                if (!gatt.discoverServices()) {
                    eventBus.dispatch(BleEvent.Error("GATT service discovery failed to start"))
                    failConnection(gatt)
                }
                return
            }

            eventBus.dispatch(BleEvent.Error("GATT connection state change failed: $status"))
            failConnection(gatt)
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (!isActiveGatt(gatt)) {
                return
            }
            if (status != BluetoothGatt.GATT_SUCCESS) {
                eventBus.dispatch(BleEvent.Error("GATT service discovery failed: $status"))
                failConnection(gatt)
                return
            }
            bindCharacteristics(gatt)
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            if (!isActiveGatt(gatt) || descriptor.uuid != CLIENT_CHARACTERISTIC_CONFIG_UUID) {
                return
            }
            if (status == BluetoothGatt.GATT_SUCCESS) {
                communicationReady = true
                reconnectPolicy.reset()
                connectRetryCount = 0
                eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.ConnectSuccess))
            } else {
                eventBus.dispatch(BleEvent.Error("BLE notification descriptor write failed: $status"))
                failConnection(gatt)
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            if (!isActiveGatt(gatt) || characteristic.uuid != config.writeCharacteristicUuid) {
                return
            }
            val hex = pendingWriteHex
            pendingWriteHex = null
            if (status == BluetoothGatt.GATT_SUCCESS) {
                hex?.let { eventBus.dispatch(BleEvent.DataSent(it)) }
            } else {
                eventBus.dispatch(BleEvent.Error("BLE write failed: $status"))
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (!isActiveGatt(gatt)) {
                return
            }
            handleIncoming(value)
        }

        @Deprecated("Android keeps this callback for older API behavior")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            if (!isActiveGatt(gatt)) {
                return
            }
            handleIncoming(characteristic.value ?: byteArrayOf())
        }
    }

    @SuppressLint("MissingPermission")
    fun connect(mac: String) {
        connectRetryCount = 0
        connect(mac, device = null, resetReconnectPolicy = true)
    }

    @SuppressLint("MissingPermission")
    fun connect(device: BluetoothDevice) {
        connectRetryCount = 0
        connect(device.address, device = device, resetReconnectPolicy = true)
    }

    @SuppressLint("MissingPermission")
    private fun connect(mac: String, device: BluetoothDevice?, resetReconnectPolicy: Boolean) {
        if (!hasConnectPermission()) {
            eventBus.dispatch(BleEvent.Error("Bluetooth connect permission is missing"))
            finishReconnectFailure(resetReconnectPolicy)
            return
        }

        val bluetoothManager = context.getSystemService(BluetoothManager::class.java)
        val adapter = bluetoothManager?.adapter
        if (adapter == null) {
            eventBus.dispatch(BleEvent.Error("Bluetooth adapter is unavailable"))
            finishReconnectFailure(resetReconnectPolicy)
            return
        }

        val target = device ?: runCatching { adapter.getRemoteDevice(mac) }.getOrNull()
        if (target == null) {
            eventBus.dispatch(BleEvent.Error("Bluetooth device not found: $mac"))
            finishReconnectFailure(resetReconnectPolicy)
            return
        }

        closeGatt()
        clearSessionState()
        connectedMac = mac
        connectedDevice = target
        if (resetReconnectPolicy) {
            reconnectPolicy.reset()
        }
        eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.Connecting))
        // 显式 TRANSPORT_LE：默认 TRANSPORT_AUTO 在部分机型（如华为）上会先尝试 Classic，
        // 对纯 BLE 设备导致 status=133 连接失败
        gatt = target.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    @SuppressLint("MissingPermission")
    fun disconnect(mac: String) {
        if (connectedMac != mac) {
            return
        }
        if (!hasConnectPermission()) {
            eventBus.dispatch(BleEvent.Error("Bluetooth connect permission is missing"))
            return
        }

        val currentGatt = gatt
        connectedMac = null
        connectedDevice = null
        reconnectPolicy.reset()
        connectRetryCount = 0
        clearSessionState()
        gatt = null
        currentGatt?.disconnect()
        currentGatt?.close()
        eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.DisConnected))
    }

    @SuppressLint("MissingPermission")
    fun release() {
        connectedMac = null
        connectedDevice = null
        reconnectPolicy.reset()
        connectRetryCount = 0
        clearSessionState()
        closeGatt()
        eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.DisConnected))
    }

    fun isConnected(): Boolean = gatt != null && writeCharacteristic != null && communicationReady

    @SuppressLint("MissingPermission")
    fun send(bytes: ByteArray): Boolean {
        if (!hasConnectPermission()) {
            eventBus.dispatch(BleEvent.Error("Bluetooth connect permission is missing"))
            return false
        }

        val targetGatt = gatt ?: return false
        val characteristic = writeCharacteristic ?: return false
        if (!communicationReady) {
            eventBus.dispatch(BleEvent.Error("BLE communication is not ready"))
            return false
        }
        if (pendingWriteHex != null) {
            eventBus.dispatch(BleEvent.Error("BLE write already in progress"))
            return false
        }
        pendingWriteHex = HexCodec.encode(bytes)
        val writeWithoutResponse = writeTypeFor(characteristic) == BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        val success = writeCharacteristicCompat(targetGatt, characteristic, bytes)
        if (!success) {
            pendingWriteHex = null
            eventBus.dispatch(BleEvent.Error("BLE write failed"))
        } else if (writeWithoutResponse) {
            pendingWriteHex = null
            eventBus.dispatch(BleEvent.DataSent(HexCodec.encode(bytes)))
        }
        return success
    }

    fun readDeviceInfo(): Boolean = send(BleProtocol.terminalInfoCommand())

    fun setChildLock(lock: Boolean): Boolean = send(BleProtocol.childLockCommand(lock))

    @SuppressLint("MissingPermission")
    private fun bindCharacteristics(gatt: BluetoothGatt) {
        val serviceUuid = config.serviceUuid
        val writeUuid = config.writeCharacteristicUuid
        val notifyUuid = config.notifyCharacteristicUuid
        if (serviceUuid == null || writeUuid == null || notifyUuid == null) {
            eventBus.dispatch(BleEvent.Error("BLE communication UUIDs are not configured"))
            eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.Error, "UUID not configured"))
            failConnection(gatt)
            return
        }

        val service = gatt.getService(serviceUuid)
        if (service == null) {
            eventBus.dispatch(BleEvent.Error("Communication service not found"))
            failConnection(gatt)
            return
        }

        writeCharacteristic = service.getCharacteristic(writeUuid)
        notifyCharacteristic = service.getCharacteristic(notifyUuid)
        if (writeCharacteristic == null || notifyCharacteristic == null) {
            eventBus.dispatch(BleEvent.Error("Communication characteristic not found"))
            failConnection(gatt)
            return
        }

        val notify = notifyCharacteristic ?: return
        val notificationEnabled = gatt.setCharacteristicNotification(notify, true)
        if (!notificationEnabled) {
            eventBus.dispatch(BleEvent.Error("BLE notification setup failed"))
            failConnection(gatt)
            return
        }

        val descriptor = notify.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)
        if (descriptor == null) {
            eventBus.dispatch(BleEvent.Error("BLE notification descriptor not found"))
            failConnection(gatt)
            return
        }
        if (!writeDescriptorCompat(gatt, descriptor)) {
            eventBus.dispatch(BleEvent.Error("BLE notification descriptor write failed to start"))
            failConnection(gatt)
            return
        }
    }

    private fun handleIncoming(bytes: ByteArray) {
        eventBus.dispatch(BleEvent.DataReceived(HexCodec.encode(bytes)))
        val frame = BleProtocol.decodeFrame(bytes).getOrElse {
            eventBus.dispatch(BleEvent.Error("Failed to parse BLE frame: ${it.message}"))
            return
        }

        when (frame.cmd) {
            0xA1 -> {
                if (frame.data.size >= 3) {
                    BleProtocol.parseTerminalInfoResponse(frame)
                        .onSuccess { eventBus.dispatch(BleEvent.DeviceInfoReceived(it)) }
                        .onFailure { eventBus.dispatch(BleEvent.Error("Terminal info parse error: ${it.message}")) }
                } else {
                    BleProtocol.parseChildLockResponse(frame)
                        .onSuccess { eventBus.dispatch(BleEvent.DeviceStateReceived(it.locked)) }
                        .onFailure { eventBus.dispatch(BleEvent.Error("Child lock parse error: ${it.message}")) }
                }
            }

            0xA2 -> BleProtocol.parseTerminalInfoResponse(frame)
                .onSuccess { eventBus.dispatch(BleEvent.DeviceInfoReceived(it)) }
                .onFailure { eventBus.dispatch(BleEvent.Error("Terminal info parse error: ${it.message}")) }

            else -> eventBus.dispatch(BleEvent.Error("Unknown BLE CMD: 0x${frame.cmd.toString(16).uppercase()}"))
        }
    }

    @SuppressLint("MissingPermission")
    private fun handleDisconnected(callbackGatt: BluetoothGatt? = null, allowReconnect: Boolean) {
        if (callbackGatt != null && !isActiveGatt(callbackGatt)) {
            return
        }

        val wasReady = communicationReady
        val mac = connectedMac
        val device = connectedDevice
        closeGatt()
        clearSessionState()

        if (allowReconnect && wasReady && mac != null && reconnectPolicy.shouldRetry()) {
            eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.Reconnecting))
            connect(mac, device = device, resetReconnectPolicy = false)
            return
        }

        eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.DisConnected))
    }

    private fun failConnection(callbackGatt: BluetoothGatt? = null) {
        handleDisconnected(callbackGatt, allowReconnect = false)
    }

    private fun finishReconnectFailure(resetReconnectPolicy: Boolean) {
        if (!resetReconnectPolicy) {
            connectedMac = null
            connectedDevice = null
            clearSessionState()
            eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.DisConnected))
        }
    }

    private fun clearSessionState() {
        writeCharacteristic = null
        notifyCharacteristic = null
        communicationReady = false
        pendingWriteHex = null
    }

    @SuppressLint("MissingPermission")
    private fun closeGatt() {
        val currentGatt = gatt
        gatt = null
        currentGatt?.close()
    }

    private fun isActiveGatt(callbackGatt: BluetoothGatt): Boolean = gatt === callbackGatt

    @SuppressLint("MissingPermission")
    private fun writeCharacteristicCompat(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
    ): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeCharacteristic(
            characteristic,
            value,
            writeTypeFor(characteristic),
        ) == BluetoothStatusCodes.SUCCESS
    } else {
        writeCharacteristicLegacy(gatt, characteristic, value)
    }

    @Suppress("DEPRECATION")
    @SuppressLint("MissingPermission")
    private fun writeCharacteristicLegacy(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
    ): Boolean {
        characteristic.value = value
        characteristic.writeType = writeTypeFor(characteristic)
        return gatt.writeCharacteristic(characteristic)
    }

    private fun writeTypeFor(characteristic: BluetoothGattCharacteristic): Int =
        if (characteristic.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        }

    @SuppressLint("MissingPermission")
    private fun writeDescriptorCompat(
        gatt: BluetoothGatt,
        descriptor: BluetoothGattDescriptor,
    ): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeDescriptor(
            descriptor,
            BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE,
        ) == BluetoothStatusCodes.SUCCESS
    } else {
        writeDescriptorLegacy(gatt, descriptor)
    }

    @Suppress("DEPRECATION")
    @SuppressLint("MissingPermission")
    private fun writeDescriptorLegacy(
        gatt: BluetoothGatt,
        descriptor: BluetoothGattDescriptor,
    ): Boolean {
        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        return gatt.writeDescriptor(descriptor)
    }

    private fun hasConnectPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    private companion object {
        const val MAX_CONNECT_RETRIES = 2
        val CLIENT_CHARACTERISTIC_CONFIG_UUID: UUID =
            UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }
}
