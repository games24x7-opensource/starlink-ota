const os = require('os');

const getmac = {};
getmac.GetMacAddress = function () {
  const objInterfaces = os.networkInterfaces();
  const arrPreferances = ['eth', 'wlan', 'lo', ''];

  for (let j = 0; j < arrPreferances.length; j++) {
    for (const key in objInterfaces) {
      if (key.toLowerCase().indexOf(arrPreferances[j]) == 0) {
        const arrAddress = objInterfaces[key];

        for (let i = 0; i < arrAddress.length; i++) {
          const address = arrAddress[i];
          if (address.mac != '00:00:00:00:00:00' && !address.internal) {
            return address.mac;
          }
        }
      }
    }
  }
  return false;
};

console.log('MacAddress: ' + getmac.GetMacAddress());

module.exports = getmac;
