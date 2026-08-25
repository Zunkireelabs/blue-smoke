import Testing
@testable import h158lib

struct ScanResultStoreTests {

    @Test func upsert_appendsNewDeviceInOrder() {
        let store = ScanResultStore()

        let devices1 = store.upsert(BleScanDevice(name: "A", id: "id-1", rssi: -50))
        let devices2 = store.upsert(BleScanDevice(name: "B", id: "id-2", rssi: -60))

        #expect(devices1.map(\.id) == ["id-1"])
        #expect(devices2.map(\.id) == ["id-1", "id-2"])
    }

    @Test func upsert_sameIdUpdatesInPlaceKeepingOrder() {
        let store = ScanResultStore()
        store.upsert(BleScanDevice(name: "A", id: "id-1", rssi: -80))
        store.upsert(BleScanDevice(name: "B", id: "id-2", rssi: -40))

        let devices = store.upsert(BleScanDevice(name: "A", id: "id-1", rssi: -30))

        #expect(devices.map(\.id) == ["id-1", "id-2"])
        #expect(devices[0].rssi == -30)
    }

    @Test func clear_emptiesStore() {
        let store = ScanResultStore()
        store.upsert(BleScanDevice(name: "A", id: "id-1", rssi: -50))
        store.clear()

        #expect(store.upsert(BleScanDevice(name: "B", id: "id-2", rssi: -60)).map(\.id) == ["id-2"])
    }
}
