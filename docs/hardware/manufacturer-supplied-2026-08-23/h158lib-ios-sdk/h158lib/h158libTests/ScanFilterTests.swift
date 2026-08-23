import Testing
@testable import h158lib

struct ScanFilterTests {

    // ---- matchesScanFilter ----

    @Test func matchesScanFilter_nilPrefixMatchesEverything() {
        #expect(BleScanner.matchesScanFilter(name: "AnyDevice", prefix: nil))
    }

    @Test func matchesScanFilter_emptyPrefixMatchesEverything() {
        #expect(BleScanner.matchesScanFilter(name: "AnyDevice", prefix: ""))
    }

    @Test func matchesScanFilter_matchingPrefix() {
        #expect(BleScanner.matchesScanFilter(name: "YP65-AT-1234", prefix: "YP65-AT"))
    }

    @Test func matchesScanFilter_caseInsensitivePrefix() {
        #expect(BleScanner.matchesScanFilter(name: "yp65-at-1234", prefix: "YP65-AT"))
    }

    @Test func matchesScanFilter_nonMatchingPrefix() {
        #expect(!BleScanner.matchesScanFilter(name: "Other-Device", prefix: "YP65-AT"))
    }

    @Test func matchesScanFilter_prefixInMiddleDoesNotMatch() {
        #expect(!BleScanner.matchesScanFilter(name: "XX-YP65-AT", prefix: "YP65-AT"))
    }

    // ---- visibleDeviceName ----

    @Test func visibleDeviceName_prefersPeripheralName() {
        #expect(BleScanner.visibleDeviceName(peripheralName: "HQD-1", advertisedName: "HQD-2") == "HQD-1")
    }

    @Test func visibleDeviceName_fallsBackToAdvertisedName() {
        #expect(BleScanner.visibleDeviceName(peripheralName: nil, advertisedName: "HQD-2") == "HQD-2")
    }

    @Test func visibleDeviceName_skipsBlankPeripheralName() {
        #expect(BleScanner.visibleDeviceName(peripheralName: "  ", advertisedName: "HQD") == "HQD")
    }

    @Test func visibleDeviceName_skipsUnknownName() {
        #expect(BleScanner.visibleDeviceName(peripheralName: "Unknown", advertisedName: "HQD") == "HQD")
        #expect(BleScanner.visibleDeviceName(peripheralName: "unknown", advertisedName: nil) == nil)
    }

    @Test func visibleDeviceName_returnsNilWhenNoUsableName() {
        #expect(BleScanner.visibleDeviceName(peripheralName: nil, advertisedName: nil) == nil)
        #expect(BleScanner.visibleDeviceName(peripheralName: "", advertisedName: " ") == nil)
    }
}
