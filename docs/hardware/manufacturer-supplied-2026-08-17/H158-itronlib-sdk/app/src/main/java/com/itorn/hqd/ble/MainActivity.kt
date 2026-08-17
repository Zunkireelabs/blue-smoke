package com.itorn.hqd.ble

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import com.itorn.hqd.itronlib.DeviceManager
import com.itorn.hqd.itronlib.event.EventListener
import com.itorn.hqd.itronlib.model.BleState
import com.itorn.hqd.itronlib.model.VMPenEventType

class MainActivity : AppCompatActivity() {
    private val deviceManager = DeviceManager.getInstance()
    private lateinit var viewModel: BleDemoViewModel
    private val listener = EventListener { event ->
        runOnUiThread {
            viewModel.onBleEvent(event)
            render(viewModel.uiState.value)
        }
    }
    private lateinit var content: LinearLayout
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { permissions ->
        updateUi {
            if (permissions.values.all { it }) {
                viewModel.startScanIfIdle()
            } else {
                viewModel.onPermissionDenied()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        viewModel = ViewModelProvider(this)[BleDemoViewModel::class.java]
        if (!viewModel.sdkInitialized) {
            deviceManager.init(application)
            viewModel.markSdkInitialized()
        }
        VMPenEventType.values().forEach { deviceManager.addEventListener(it, listener) }
        setContentView(createRoot())
        render(viewModel.uiState.value)
        requestBluetoothPermissions()
    }

    override fun onDestroy() {
        VMPenEventType.values().forEach { deviceManager.removeEventListener(it, listener) }
        if (!isChangingConfigurations) {
            deviceManager.release()
            viewModel.markSdkReleased()
        }
        super.onDestroy()
    }

    private fun createRoot(): ScrollView {
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
        }
        return ScrollView(this).apply {
            addView(
                content,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
    }

    private fun requestBluetoothPermissions() {
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            emptyArray()
        }
        if (permissions.isEmpty()) {
            updateUi { viewModel.startScanIfIdle() }
        } else {
            permissionLauncher.launch(permissions)
        }
    }

    private fun render(state: BleDemoUiState) {
        content.removeAllViews()
        content.addTitle("H158 Demo name：YP65-AT")
        content.addText("Status: ${state.statusText}")
        state.errorText?.let { content.addText("Error: $it") }

        if (state.connectionState == BleState.Connecting ||
            state.connectionState == BleState.ConnectSuccess ||
            state.connectionState == BleState.Reconnecting
        ) {
            renderSession(state)
        } else {
            renderScanner(state)
        }
    }

    private fun renderScanner(state: BleDemoUiState) {
        content.addButton("Scan BLE") { updateUi { viewModel.startScan() } }
        content.addView(CheckBox(this).apply {
            text = "Show YP65-AT only"
            isChecked = state.yp65FilterEnabled
            setOnCheckedChangeListener { _, isChecked ->
                updateUi { viewModel.setYp65Filter(isChecked) }
            }
        })
        state.devices.forEach { device ->
            content.addButton("${device.name}  RSSI ${device.rssi}\n${device.mac}") {
                updateUi { viewModel.connect(device) }
            }
        }
    }

    private fun renderSession(state: BleDemoUiState) {
        val deviceText = state.selectedDevice?.let { "${it.name}  ${it.mac}" } ?: "No device"
        content.addText("Device: $deviceText")
        val info = state.deviceInfo
        content.addText(
            "Lock: ${info?.let { if (it.locked) "Locked" else "Unlocked" } ?: "--"}  " +
                "System: ${info?.systemState?.label ?: "--"}  " +
                "Battery: ${info?.let { "${it.batteryPercent}%" } ?: "--"}",
        )
        content.addButton("Read Device Info") { updateUi { viewModel.readDeviceInfo() } }
        content.addButton("Child Lock ON") { updateUi { viewModel.setChildLock(true) } }
        content.addButton("Child Lock OFF") { updateUi { viewModel.setChildLock(false) } }
        content.addButton("Clear Logs") { updateUi { viewModel.clearLogs() } }
        content.addButton("Disconnect") { updateUi { viewModel.disconnect() } }
        content.addText("Logs")
        state.logs.takeLast(80).forEach { log ->
            content.addText("${log.time} ${log.direction} ${log.hex}")
        }
    }

    private fun updateUi(action: () -> Unit) {
        action()
        render(viewModel.uiState.value)
    }

    private fun LinearLayout.addTitle(text: String) {
        addView(TextView(context).apply {
            this.text = text
            textSize = 22f
        })
    }

    private fun LinearLayout.addText(text: String) {
        addView(TextView(context).apply {
            this.text = text
            textSize = 15f
            setPadding(0, 10, 0, 10)
        })
    }

    private fun LinearLayout.addButton(text: String, action: () -> Unit) {
        addView(Button(context).apply {
            this.text = text
            setAllCaps(false)
            setOnClickListener { action() }
        })
    }
}
