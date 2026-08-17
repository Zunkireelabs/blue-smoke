package com.itorn.hqd.itronlib.config

import java.util.UUID

data class BleSdkConfig(
    val serviceUuid: UUID? = DEFAULT_SERVICE_UUID,
    val writeCharacteristicUuid: UUID? = DEFAULT_WRITE_CHARACTERISTIC_UUID,
    val notifyCharacteristicUuid: UUID? = DEFAULT_NOTIFY_CHARACTERISTIC_UUID,
    val scanTimeoutMs: Long = 20_000L,
    // 扫描只保留名称匹配该前缀的设备；为 null 时不过滤
    val scanNamePrefix: String? = DEFAULT_SCAN_NAME_PREFIX,
) {
    fun isConfigured(): Boolean =
        serviceUuid != null && writeCharacteristicUuid != null && notifyCharacteristicUuid != null

    companion object {
        // YP65-AT 真实 UUID（LightBlue 实测）：服务 0xFFF0，收发数据均走 0xFFF1
        const val DEFAULT_SCAN_NAME_PREFIX: String = "YP65-AT"
        val DEFAULT_SERVICE_UUID: UUID = UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb")
        val DEFAULT_WRITE_CHARACTERISTIC_UUID: UUID = UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb")
        val DEFAULT_NOTIFY_CHARACTERISTIC_UUID: UUID = UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb")
    }
}
