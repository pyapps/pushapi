const express = require('express')
const app = express()
const cors = require('cors')
const bodyParser = require('body-parser');
const port = process.env.PORT || 3000;
const webpush = require('web-push');
const path = require('path');
let Datastore = require('nedb'), db = new Datastore({ filename: 'data.db', autoload: true });

const vapidKeys = {
    publicKey: 'BBALy4Gfyfa4bsyVdjrOvTSBQeTBfM-wsn2sDKJ4kCsUa-b0gju-noVq5FxX32d52y60OSJd-lRi6XoFilGxQWM',
    privateKey: 'kZV5GNRa-rKau-5BJ9T6Y0hB0KKD4bUgzM3rEcU_Hro'
};
webpush.setVapidDetails('https://py-nodeapi.herokuapp.com', vapidKeys.publicKey, vapidKeys.privateKey);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

app.post('/api/save-subscription/', function (req, res) {
    if (!isValidSaveRequest(req, res)) {
        return;
    }

    return saveSubscriptionToDatabase(req.body)
        .then(function (subscriptionId) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ data: { success: true } }));
        })
        .catch(function (err) {
            res.status(500);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({
                error: {
                    id: 'unable-to-save-subscription',
                    message: 'The subscription was received but we were unable to save it to our database.'
                }
            }));
        });
});

const isValidSaveRequest = (req, res) => {
    // Check the request body has at least an endpoint.
    if (!req.body || !req.body.endpoint) {
        // Not a valid subscription.
        res.status(400);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
            error: {
                id: 'no-endpoint',
                message: 'Subscription must have an endpoint.'
            }
        }));
        return false;
    }
    return true;
};

function saveSubscriptionToDatabase(subscription) {
    return new Promise(function (resolve, reject) {
        db.insert(subscription, function (err, newDoc) {
            if (err) { reject(err); return; }
            resolve(newDoc._id);
        });
    });
};

app.post('/api/delete-subscription/', function (req, res) {
    return deleteSubscriptionFromDatabase(req.body)
        .then(function (subscriptionId) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ data: { success: true } }));
        })
        .catch(function (err) {
            res.status(500);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({
                error: {
                    id: 'unable-to-save-subscription',
                    message: 'The subscription was received but we were unable to save it to our database.'
                }
            }));
        });
});

function deleteSubscriptionFromDatabase() {
    return new Promise(function (resolve, reject) {
        db.remove({}, { multi: true }, function (err, numRemoved) {
            if (err) { reject(err); return; }
            resolve(numRemoved);
        });
    });

}

function getSubscriptionsFromDatabase() {
    return new Promise(function (resolve, reject) {
        db.find({}, function (err, newDoc) {
            if (err) { reject(err); return; }
            resolve(newDoc);
        });
    });
}

app.post('/api/trigger-push-msg/', function (req, res) {
    return getSubscriptionsFromDatabase().then(function (subscriptions) {
        let promiseChain = Promise.resolve();
        for (let i = 0; i < subscriptions.length; i++) {
            const subscription = subscriptions[i];
            promiseChain = promiseChain.then(() => {
                return triggerPushMsg(subscription, req.body.payload);
            });
        }
        return promiseChain;
    }).then(() => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({ data: { success: true } }));
    }).catch(function (err) {
        res.status(500);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
            error: {
                id: 'unable-to-send-messages',
                message: `We were unable to send messages to all subscriptions : ` +
                    `'${err.message}'`
            }
        }));
    });
});

const triggerPushMsg = function (subscription, dataToSend) {
    return webpush.sendNotification(subscription, dataToSend).catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
            console.log('Subscription has expired or is no longer valid: ', err);
            return deleteSubscriptionFromDatabase(subscription._id);
        } else {
            throw err;
        }
    });
};


app.post('/sendNotification', function (req, res) {
    const subscription = req.body.subscription;
    const payload = req.body.payload;
    const options = {
        TTL: req.body.ttl
    };

    setTimeout(function () {
        webPush.sendNotification(subscription, payload, options)
            .then(function () {
                res.sendStatus(201);
            })
            .catch(function (error) {
                console.log(error);
                res.sendStatus(500);
            });
    }, req.body.delay * 1000);
});

app.get('/test', (req, res) => {
    res.send('working!!');
})
app.use(express.static('pwa'));

app.listen(port, () => console.log(`NodeAPI listening at :${port}`));