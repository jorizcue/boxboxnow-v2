import Foundation
import CoreBluetooth
import Combine

final class BLEManager: NSObject, ObservableObject {
    @Published var isScanning = false
    @Published var connectedDevice: CBPeripheral?
    @Published var discoveredDevices: [CBPeripheral] = []
    @Published var rssi: Int = 0
    @Published var batteryPercent: Int?

    var onData: ((Data) -> Void)?

    private var centralManager: CBCentralManager!
    private var lastSampleTime: TimeInterval = 0
    private let throttleInterval: TimeInterval = 0.1

    private let uartServiceUUID = CBUUID(string: Constants.BLE.uartServiceUUID)
    private let uartTxCharUUID  = CBUUID(string: Constants.BLE.uartTxCharUUID)

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    func startScan() {
        guard centralManager.state == .poweredOn else { return }
        discoveredDevices.removeAll()
        centralManager.scanForPeripherals(withServices: [uartServiceUUID], options: nil)
        isScanning = true
    }

    func stopScan() { centralManager.stopScan(); isScanning = false }

    func connect(_ peripheral: CBPeripheral) {
        stopScan()
        centralManager.connect(peripheral, options: nil)
    }

    func disconnect() {
        if let d = connectedDevice { centralManager.cancelPeripheralConnection(d) }
    }
}

extension BLEManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn { isScanning = false }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
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
        let now = CACurrentMediaTime()
        guard now - lastSampleTime >= throttleInterval else { return }
        lastSampleTime = now
        onData?(data)
    }

    func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
        rssi = RSSI.intValue
    }
}
