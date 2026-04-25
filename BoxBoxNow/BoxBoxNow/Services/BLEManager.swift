import Foundation
import CoreBluetooth
import Combine
import QuartzCore

final class BLEManager: NSObject, ObservableObject {
    @Published var isScanning = false
    @Published var connectedDevice: CBPeripheral?
    @Published var discoveredDevices: [CBPeripheral] = []
    @Published var rssi: Int = 0
    @Published var batteryPercent: Int?

    var onData: ((Data) -> Void)?

    private var centralManager: CBCentralManager!

    private let uartServiceUUID = CBUUID(string: Constants.BLE.uartServiceUUID)
    private let uartTxCharUUID  = CBUUID(string: Constants.BLE.uartTxCharUUID)

    /// Names we treat as RaceBox devices. Matching is case-insensitive and
    /// prefix-based so variants like "RaceBox Mini 1234567" also match.
    private let raceboxNamePrefixes = ["racebox"]

    /// Set to `true` when the user asked for a scan before the central was
    /// `poweredOn`. `centralManagerDidUpdateState` kicks it off once ready.
    private var pendingScan = false

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    func startScan() {
        // Defer until the central is ready — otherwise the request is a silent
        // no-op and the user has to tap "Buscar dispositivos" again.
        guard centralManager.state == .poweredOn else {
            pendingScan = true
            return
        }
        discoveredDevices.removeAll()

        // Surface already-connected RaceBox peripherals instantly. iOS caches
        // these across app launches, so a previously-paired device appears
        // without having to wait for an advertisement at all.
        let known = centralManager.retrieveConnectedPeripherals(withServices: [uartServiceUUID])
        for p in known where isRaceBoxName(p.name) {
            if !discoveredDevices.contains(where: { $0.identifier == p.identifier }) {
                discoveredDevices.append(p)
            }
        }

        // Scan without a service-UUID filter. RaceBox advertises the 128-bit
        // Nordic UART service in the scan response (not the primary adv),
        // which iOS's service filter misses for several seconds. Scanning
        // unfiltered + matching by name makes the device appear in ~1s.
        // AllowDuplicates keeps the scan rate high so the RSSI/list refresh
        // while the config screen is open.
        centralManager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )
        isScanning = true
    }

    func stopScan() {
        pendingScan = false
        centralManager.stopScan()
        isScanning = false
    }

    func connect(_ peripheral: CBPeripheral) {
        stopScan()
        centralManager.connect(peripheral, options: nil)
    }

    func disconnect() {
        if let d = connectedDevice { centralManager.cancelPeripheralConnection(d) }
    }

    private func isRaceBoxName(_ name: String?) -> Bool {
        guard let n = name?.lowercased() else { return false }
        return raceboxNamePrefixes.contains { n.hasPrefix($0) }
    }
}

extension BLEManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            // If the user tapped scan before BLE was ready, honour it now.
            if pendingScan {
                pendingScan = false
                startScan()
            }
        } else {
            isScanning = false
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        // The scan runs unfiltered (see startScan for why) so we gate on the
        // advertised name here. The local-name adv data field is sometimes
        // fresher than peripheral.name, so check both.
        let advName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        guard isRaceBoxName(peripheral.name) || isRaceBoxName(advName) else { return }

        if !discoveredDevices.contains(where: { $0.identifier == peripheral.identifier }) {
            discoveredDevices.append(peripheral)
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectedDevice = peripheral
        peripheral.delegate = self
        peripheral.discoverServices([uartServiceUUID])
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        connectedDevice = nil
    }
}

extension BLEManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for svc in services where svc.uuid == uartServiceUUID {
            peripheral.discoverCharacteristics([uartTxCharUUID], for: svc)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let chars = service.characteristics else { return }
        for ch in chars where ch.uuid == uartTxCharUUID {
            peripheral.setNotifyValue(true, for: ch)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        // No throttle: pass every BLE notification straight to the UBX parser.
        // A previous 100ms throttle was capping effective rate at ~10Hz and
        // dropping ~80% of RaceBox packets when the device runs at 50Hz.
        // RaceBox payloads are ~90 bytes; even at 50Hz that's <5KB/s — well
        // within what iOS can handle on the main thread.
        onData?(data)
    }

    func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
        rssi = RSSI.intValue
    }
}
