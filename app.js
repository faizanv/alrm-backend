var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var firebase = require('firebase');
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();

// Initialize the app with a service account
firebase.initializeApp({
    databaseURL: "https://alrmup-ae85a.firebaseio.com/",
    serviceAccount: "keys/alrmup-d5e0526322d2.json"
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

var db = firebase.database();
var usersRef = db.ref("users");


setInterval(userLoop, 1000);
setInterval(updateAlarms, 1000);

//loop on users
function userLoop(){
  usersRef.once('value', function (snapshot) {
      snapshot.forEach(function (childSnapshot) {
          var user = childSnapshot.key;
          var token = childSnapshot.child('token').val();
          updateEvents(authToken(token, user), user);
      })
  });
}

//update alarms
function updateAlarms() {
    usersRef.once("value", function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
            var events = childSnapshot.child('events').val();

            var firstEventMap = {}; // {Tue Nov 08 2016: 07:30:00 GMT-0500 (EST)}
            for (var i in events) {
                if(new Date(events[i].start.dateTime) != "Invalid Date") {
                    var d = new Date(events[i].start.dateTime); // 2016-11-07T11:00:00.000Z
                    var date = d.toDateString();
                    if (!(date in firstEventMap)) {
                        firstEventMap[date] = d.getTime();
                    } else {
                        if (d.toTimeString() < firstEventMap[date]) {
                            firstEventMap[date] = d.getTime();
                        }    
                    }
                }
            }

            var alarmMap = {}; // {0: 1478606400}
            var t = 0;
            for (var k in firstEventMap) {
                alarmMap[t] = firstEventMap[k] / 1000 - 1800; // 30 min earlier
                t = t + 1;
            }

            var userId = childSnapshot.key;
            usersRef.child(userId).update({
                "alarms" : alarmMap
            });
            console.log('Updated alarms for ' + userId);
        })
    });
}

//creates oauth2Client 
function authToken(token, user) {
    var data = fs.readFileSync('keys/client_secret.json');
    var credentials = JSON.parse(data);
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    oauth2Client.credentials = token;
    return oauth2Client;
}

//updates user's events
function updateEvents(auth, user) {
    var calendar = google.calendar('v3');
    calendar.events.list({
        auth: auth,
        calendarId: 'primary',
        timeMin: (new Date()).toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime'
    }, function (err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var events = response.items;
        if (events.length == 0) {
            console.log('No upcoming events found.');
        } else {
            console.log('Pushed ' + user + ' events to Firebase');
            var userRef = usersRef.child(user);
            userRef.update({
                events: events,
            });

        }
    });
}


module.exports = app;
