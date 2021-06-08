let connectedCerts = ["A", "B", "C", "E", "F"]
let mongodbCerts = ["A", "D", "C"]

connectedCerts.splice(0, 2)

console.log(connectedCerts)