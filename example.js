const express = require('express')
const http = require('http');
const app = express()
const path = require('path');
const hostname = '0.0.0.0';
const port = process.env.PORT || 5130;

const logger = require('./logger');

var mongo = require('mongodb');

var cors = require('cors')
var bodyParser = require('body-parser')
require('dotenv').config();
const openvpnmanager = require('node-openvpn');

var corsOptions = {
    origin: 'http://localhost:3000',
    optionsSuccessStatus: 200
}

app.use(cors(corsOptions));

var jsonParser = bodyParser.json()

if (process.env.NODE_ENV === 'production') {
    app.use(express.static('./build'))
}


var MongoClient = require('mongodb').MongoClient;
var url = `mongodb+srv://admin1:${process.env.MONGO_PASS}@kontenerytest.4cidj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;


const opts = {
    host: '127.0.0.1',
    port: 9544,
    timeout: 1500,
    logpath: 'log.txt'
};


var dbo;

MongoClient.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}, async function (err, db) {
    if (err) throw err;
    dbo = db.db("kontenery");

    let collections = [];

    let c = await dbo.listCollections().toArray();

    console.log(c);
    c.forEach(e => {
        collections.push(e.name)
    });

    console.log(collections);

    if (!collections.includes('devices')) {
        await dbo.createCollection("devices", function (err, res) {
            if (err) throw err;
            console.log("devices created!");
            //db.close();
        });


        const devices = dbo.collection("devices")
    }



    console.log('KONTENERYTEST DB INITIATED')
    logger.info('KONTENERY MONGO DATABASE INIT')


});


app.get('/', async (req, res) => {

    return res.sendStatus(200);

})

app.get('/huj', async (req, res) => {

    openvpnmanager.getStatus();

})


//openvpn
const openvpn = openvpnmanager.connect(opts)

var fetchedFromStatus = [];
var addToStatusArray = false;


openvpn.on('console-output', output => {

    console.log('CONSOLE: ' + output)
    logger.info("OPENVPN CONSOLE: " + output)


    try {



        if (output.includes("MULTI")) {
            if (output.includes("Learn")) {

                let res_obj = rigNewDevice(output);
                console.log(res_obj)
                res_obj.status = "ONLINE"

                MONGO_addNewDevice(res_obj)

            }
        }

        if (output.includes("SIGTERM")) {

            if (output.includes("[soft,remote-exit]")) {

                const cert_name = fetchDisconnectedCertName(output);
                MONGO_setOfflineFor(cert_name);

            }

        }

        if (output.includes("ROUTING TABLE")) addToStatusArray = true;
        if (output.includes("GLOBAL STATS")) {
            addToStatusArray = false;
            fetchedFromStatus = fetchedFromStatus.slice(2);
            console.log(fetchedFromStatus)
            MONGO_updateDeviceList(fetchedFromStatus);

        }


        if (addToStatusArray) {
            fetchedFromStatus.push(output);
        }





    } catch (e) {
        console.log("LOGPARSER ERROR: \n\n" + e)
    }

});

// emits console output of openvpn state as a array
openvpn.on('state-change', state => {
    console.log("STATE: " + state)
    logger.info("OPENVPN STATE: " + state)
});

// emits console output of openvpn state as a string
openvpn.on('error', error => {
    console.log("ERROR: " + error)
    logger.error("OPENVPN ERROR: " + error)
});


function rigNewDevice(str) {

    let input = str.split('Learn:')[1]

    let arr1 = input.split("->");

    const local_ip = arr1[0].trim();

    let arr2 = arr1[1].split("/");

    const cert_name = arr2[0].trim();
    const public_ip = arr2[1].trim();

    var obj = {
        local_ip,
        cert_name,
        public_ip
    }

    return obj
}

function fetchDisconnectedCertName(str) {
    let input = str.split('/')
    let s1 = input[0].split(',');
    let name = s1[s1.length - 1]

    return name;
}


async function MONGO_addNewDevice(device) {

    try {

        const m_exists = await dbo.collection('devices').findOne({ cert_name: device.cert_name });

        if (!m_exists) {

            await dbo.collection('devices').insertOne(device);

        }
        else {

            await dbo.collection('devices').updateOne({ cert_name: device.cert_name }, {
                $set: {
                    cert_name: device.cert_name,
                    local_ip: device.local_ip,
                    public_ip: device.public_ip,
                    status: device.status
                }
            })
        }


    }
    catch (e) {
        console.log("MONGO_addNewDevice ERROR: " + e)
    }

}

async function MONGO_setOfflineFor(cert_name) {

    try {

        await dbo.collection('devices').updateOne({ cert_name: cert_name }, {
            $set: {
                status: "OFFLINE",
                local_ip: "-",
                public_ip: "-"

            }
        })

    } catch (e) {
        console.log("MONGO_setOfflineFor ERROR: " + e)
    }

}

async function MONGO_updateDeviceList(list) {
    try {
        let exsisitngDevices = await dbo.collection("devices").find({}).toArray();
        console.log(exsisitngDevices);

        var arrayConnected = [];
        let connectedCerts = [];
        let mongodbCerts = [];

        list.forEach(entry => {
            let subarr = entry.split(",");

            connectedCerts.push(subarr[2]);

            arrayConnected.push({
                local_ip: subarr[0],
                cert_name: subarr[1],
                public_ip: subarr[2],
                status: 'ONLINE'
            })
        });

        exsisitngDevices.forEach(entry => {
            mongodbCerts.push(entry.cert_name);
        });


        let newDevices = connectedCerts.filter(e => !mongodbCerts.includes(e));
        let offlineDevices = mongodbCerts.filter(e => !connectedCerts.includes(e));
        let onlineDevices = connectedCerts.filter(e => mongodbCerts.includes(e));




        console.log("NEW DEVICES: " + newDevices.length)
        console.log("OFFLINE DEVICES: " + offlineDevices.length)
        console.log("ONLINE DEVICES: " + onlineDevices.length)

        await dbo.collection("devices").updateMany(
            { cert_name: { $in: offlineDevices } },
            {
                $set: {
                    status: "OFFLINE",
                    local_ip: "-",
                    public_ip: "-"
                }
            }
        )

        let devicesToSetOnline = arrayConnected.filter(e => onlineDevices.includes(e.cert_name));
        for (var i = 0; i < devicesToSetOnline.length; i++) {
            let device = devicesToSetOnline[i];
            let mongodbDevice = exsisitngDevices.find(el => el.cert_name = device.cert_name);

            if (mongodbDevice.public_ip != device.public_ip || mongodbDevice.local_ip != device.local_ip || mongodbDevice.status == "OFFLINE") {
                await dbo.collection("devices").updateOne({
                    cert_name: device.cert_name
                },
                    {
                        $set: {
                            status: "ONLINE",
                            local_ip: device.local_ip,
                            public_ip: device.public_ip
                        }
                    }
                )
            }
        }



        let devicesToAdd = arrayConnected.filter(e => newDevices.includes(e.cert_name));
        await dbo.collection("devices").insertMany(devicesToAdd);






    } catch (error) {
        console.log("MONGO_updateDeviceList ERROR: " + error)
    }

}


app.listen(port, function () {
    console.log('Server is running')
})