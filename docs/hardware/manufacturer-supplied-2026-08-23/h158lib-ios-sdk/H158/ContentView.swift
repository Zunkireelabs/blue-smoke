import h158lib
import SwiftUI

struct ContentView: View {
    @State private var viewModel = BleDemoViewModel(deviceController: DeviceManagerController())

    private var isInSession: Bool {
        let state = viewModel.uiState.connectionState
        return state == .connecting || state == .connectSuccess || state == .reconnecting
    }

    var body: some View {
        NavigationStack {
            Group {
                if isInSession {
                    sessionView
                } else {
                    scannerView
                }
            }
            .navigationTitle("H158 Demo")
            .onAppear {
                DeviceManager.shared.configure()
                viewModel.startListening()
                viewModel.startScanIfIdle()
            }
        }
    }

    // MARK: - 扫描态

    private var scannerView: some View {
        List {
            Section {
                HStack {
                    Label(viewModel.uiState.statusText, systemImage: "dot.radiowaves.left.and.right")
                    Spacer()
                }
                if let errorText = viewModel.uiState.errorText {
                    Label(errorText, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }

            Section {
                Toggle("Show YP65-AT only", isOn: Binding(
                    get: { viewModel.uiState.yp65FilterEnabled },
                    set: { viewModel.setYp65Filter($0) }
                ))
                Button {
                    viewModel.startScan()
                } label: {
                    HStack {
                        Spacer()
                        Label("Scan BLE", systemImage: "antenna.radiowaves.left.and.right")
                        Spacer()
                    }
                }
                .buttonStyle(.borderedProminent)
            }

            Section("Discovered Devices") {
                if viewModel.uiState.devices.isEmpty {
                    Text("No devices found")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.uiState.devices, id: \.id) { device in
                        Button {
                            viewModel.connect(device)
                        } label: {
                            HStack {
                                Image(systemName: "bluetooth")
                                    .foregroundStyle(.tint)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(device.name)
                                        .font(.body)
                                    Text(device.id)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Label("\(device.rssi)", systemImage: "antenna.radiowaves.left.and.right")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .labelStyle(.titleAndIcon)
                            }
                        }
                        .tint(.primary)
                    }
                }
            }
        }
    }

    // MARK: - 会话态

    private var sessionView: some View {
        List {
            Section {
                if let device = viewModel.uiState.selectedDevice {
                    LabeledContent("Device", value: device.name)
                    LabeledContent("ID") {
                        Text(device.id)
                            .font(.caption)
                    }
                }
                LabeledContent("Status", value: viewModel.uiState.statusText)
                if let errorText = viewModel.uiState.errorText {
                    Label(errorText, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }

            Section("Device Info") {
                let info = viewModel.uiState.deviceInfo
                LabeledContent("Child Lock") {
                    Label(
                        info.map { $0.locked ? "Locked" : "Unlocked" } ?? "--",
                        systemImage: info?.locked == true ? "lock.fill" : "lock.open"
                    )
                }
                LabeledContent("System State", value: info?.systemState.label ?? "--")
                LabeledContent("Battery", value: info.map { "\($0.batteryPercent)%" } ?? "--")
            }

            Section("Actions") {
                Button {
                    viewModel.readDeviceInfo()
                } label: {
                    HStack {
                        Spacer()
                        Label("Read Device Info", systemImage: "")
                        Spacer()
                    }
                }
                .buttonStyle(.borderedProminent)

                HStack(spacing: 12) {
                    Button {
                        viewModel.setChildLock(true)
                    } label: {
                        HStack {
                            Spacer()
                            Label("Lock ON", systemImage: "lock.fill")
                            Spacer()
                        }
                    }
                    .buttonStyle(.bordered)

                    Button {
                        viewModel.setChildLock(false)
                    } label: {
                        HStack {
                            Spacer()
                            Label("Lock OFF", systemImage: "lock.open")
                            Spacer()
                        }
                    }
                    .buttonStyle(.bordered)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))

                Button(role: .destructive) {
                    viewModel.disconnect()
                } label: {
                    HStack {
                        Spacer()
                        Label("Disconnect", systemImage: "xmark.circle")
                        Spacer()
                    }
                }
                .buttonStyle(.bordered)
            }

            Section {
                ForEach(Array(viewModel.uiState.logs.suffix(80).enumerated()), id: \.offset) { _, log in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(log.direction)
                            .font(.caption.monospaced())
                            .foregroundStyle(log.direction == "TX" ? Color.blue : (log.direction == "RX" ? Color.green : .secondary))
                        Text(log.hex)
                            .font(.caption.monospaced())
                        Spacer()
                        Text(log.time)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                HStack {
                    Text("Logs")
                    Spacer()
                    Button("Clear") { viewModel.clearLogs() }
                        .font(.caption)
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
