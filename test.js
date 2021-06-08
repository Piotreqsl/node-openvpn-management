let connectedCerts = ["A", "B", "C", "E"]
let mongodbCerts = ["A", "D", "C"]

let newDevices = connectedCerts.filter(e => !mongodbCerts.includes(e));
let offlineDevices = mongodbCerts.filter(e => !connectedCerts.includes(e));
let onlineDevices = connectedCerts.filter(e => mongodbCerts.includes(e));

console.log(newDevices);
console.log(offlineDevices);
console.log(onlineDevices);