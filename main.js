/*jslint node:true, vars:true, bitwise:true, unparam:true */
/*jshint unused:true */
// Leave the above lines for propper jshinting
//Type Node.js Here :)

var mraa = require('mraa');
var upm = require('jsupm_i2clcd');
var servo = require('jsupm_servo');
var socket = require('socket.io-client')('https://api.cheeselabs.org');

var devInfo = {info: 'I\'m here', udid: "123456", secret: "s123456"};
var status = {udid: devInfo.udid, socket_id: undefined, opened: false, locked: true};

var door   = new mraa.Gpio(3);
var button = new mraa.Gpio(8);
var sv     = new servo.Servo(6, 1500, 2000, 1);
var dtFlag = false;

door.dir(mraa.DIR_IN);
door.mode(mraa.MODE_PULLUP);
door.edge(mraa.EDGE_BOTH);
button.dir(mraa.DIR_IN);
button.edge(mraa.EDGE_BOTH);

var lcd = new upm.Jhd1313m1(6, 0x3E, 0x62);
setOfflineDisplay();
servoLock();

socket.on('connect', function(){
    socket.emit('auth', devInfo, function(data) {
        status.socket_id = data.socket_id;
        console.log('Connected to server, Socket ID = ' + status.socket_id);
        sendStatus(status);
        setReadyDisplay();
        if(door.read() === 1) setOpenedDisplay();
    });
});

socket.on('verify', function(data, callback){
    console.log('Verification code=' + data.vcode);
    setVerifyDisplay(data.vcode);
    callback(data.vcode);
});

socket.on('ready', function(data, callback){
    console.log('Device ready!');
    callback();
    setReadyDisplay();
});

socket.on('lock', function(data, callback){
    status.locked = true;
    console.log('Device LOCKED!');
    callback();
    setReadyDisplay();
});

socket.on('unlock', function(data, callback){
    status.locked = false;
    console.log('Device UNLOCKED!');
    setUnlockDisplay();
    callback();
});

socket.on('disconnect', function(){
    status.socket_id = undefined;
    setOfflineDisplay();
});

function sendStatus(statusObj, callback)
{
    socket.emit('status', statusObj, function(data) {
        if(callback) callback(data.success);
        console.log('Status reporting ' + (data.success ? 'successful' : 'failed'));
    });
}

function dateString() {
    var date = new Date();
    if(date === undefined) date = new Date();
    var locale = date.getTime() + (8 * 60 * 60 * 1000);
    date = new Date(locale);
    return (date.toISOString().slice(0, 19).replace('T', ' ')).substr(0, 16);
}

function setReadyDisplay() {
    lcd.setColor(255, 153, 0);
    lcd.setCursor(0, 0);
    lcd.write(' Locked  device ');
    lcd.setCursor(1, 0);
    lcd.write(dateString());
    dtFlag = true;
}

function setVerifyDisplay(code) {
    dtFlag = false;
    lcd.setCursor(0, 0);
    lcd.write('Security Code:');
    lcd.setCursor(1, 0);
    lcd.write('     ' + code + '     ');
}

function setOfflineDisplay() {
    dtFlag = false;
    lcd.setColor(255, 64, 0);
    lcd.setCursor(0, 0);
    lcd.write('Device Offline  ');
    lcd.setCursor(1, 0);
    lcd.write('Connecting...   ');
}

function setDeniedDisplay() {
    dtFlag = false;
    lcd.setCursor(0, 0);
    lcd.write(' Access  Denied ');
    lcd.setCursor(1, 0);
    lcd.write(' Device  LOCKED ');
}

function setOpenNowDisplay() {
    dtFlag = false;
    lcd.setCursor(0, 0);
    lcd.write('Device  Unlocked');
    lcd.setCursor(1, 0);
    lcd.write('   OPEN  NOW    ');
    lcd.setColor(0, 255, 0);
}

function setUnlockDisplay() {
    dtFlag = false;
    lcd.setCursor(0, 0);
    lcd.write(' Access GRANTED ');
    lcd.setCursor(1, 0);
    lcd.write('Touch to Unlock ');
    lcd.setColor(0, 255, 255);
}

function setOpenedDisplay() {
    dtFlag = false;
    lcd.setCursor(1, 0);
    lcd.write(' Door is Opened ');
    //lcd.setColor(0, 255, 255);
}

function servoUnlock() {
    console.log('Servo - UNLOCK');
    sv.setAngle(170);
}

function servoLock() {
    console.log('Servo - LOCK');
    sv.setAngle(20);
}

console.log('MRAA Version: ' + mraa.getVersion()); //write the mraa version to the console

button.isr(mraa.EDGE_BOTH, function() {
    if(button.read() == 1) {
        setTimeout(function() {
            if(button.read() == 1) {
                if(status.locked) {
                    setDeniedDisplay();
                    setTimeout(function() {
                        setReadyDisplay();
                    }, 3000);
                } else {
                    servoUnlock();
                    setOpenNowDisplay();
                    //TODO: Cancel if the door is opened
                    setTimeout(function() {
                        status.locked = true;
                        servoLock();
                        setReadyDisplay();
                    }, 10000);
                }
            }
        }, 50);
    }
});

var debonce = true;
door.isr(mraa.EDGE_BOTH, function() {
    if(debonce) {
        setTimeout(function() {
            if(door.read() === 0) {
                status.opened = false;
                status.locked = true;
                sendStatus(status, function() {console.log('Door closed');});
                setReadyDisplay();
            } else {
                status.opened = true;
                setOpenedDisplay();
                if(status.locked === false) {
                    servoLock();
                    //setReadyDisplay();
                }
                sendStatus(status, function() {console.log('Door opened');});
            }
            debonce = true;
        }, 50);
        debonce = false;
    }
});

//Report alive
setInterval(function() {
    if(dtFlag) {
        lcd.setCursor(1, 0);
        lcd.write(dateString());
    }
}, 2000);