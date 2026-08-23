import Foundation
import Testing
@testable import h158lib

struct BleSdkConfigTests {

    @Test func defaultConfig_isConfigured() {
        #expect(BleSdkConfig().isConfigured())
    }

    @Test func defaultConfig_usesYP65PrefixAndRealUuids() {
        let config = BleSdkConfig()

        #expect(config.scanNamePrefix == "YP65-AT")
        #expect(config.serviceUuid?.uuidString == "0000FFF0-0000-1000-8000-00805F9B34FB")
        #expect(config.writeCharacteristicUuid?.uuidString == "0000FFF1-0000-1000-8000-00805F9B34FB")
        #expect(config.notifyCharacteristicUuid?.uuidString == "0000FFF1-0000-1000-8000-00805F9B34FB")
        #expect(config.scanTimeoutMs == 20_000)
    }

    @Test func missingServiceUuid_isNotConfigured() {
        let config = BleSdkConfig(serviceUuid: nil)
        #expect(!config.isConfigured())
    }

    @Test func missingWriteUuid_isNotConfigured() {
        let config = BleSdkConfig(writeCharacteristicUuid: nil)
        #expect(!config.isConfigured())
    }

    @Test func missingNotifyUuid_isNotConfigured() {
        let config = BleSdkConfig(notifyCharacteristicUuid: nil)
        #expect(!config.isConfigured())
    }
}
