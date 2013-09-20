/*jshint evil: false, bitwise:false, strict: false, undef: true, white: false, plusplus:false, node:true */


var validators = {
    date: function(value) {
        return !isNaN(Date.parse(value));
    },
    string: function(value) {
        return (typeof value === "string");
    },
    object: function(value) {
        return (typeof value === "object" && !Array.isArray(value));
    },
    array: function(value) {
        return Array.isArray(value);
    },
    number: function(number) {
        return typeof number === "number" && !isNaN(number);
    },
    "boolean": function(boolval) {
        return typeof boolval === "boolean";
    },
    geo: function(value) {
        if (typeof value === "number" && value >= -180 && value <= +180) {
            return true;
        }
        return false;
    },
    timestamp: function(timestamp) {
        if (validators.number(timestamp) && timestamp >= 0) {
            return true;
        }
        return false;
    },
    uuidnodashes: function(value) {
        if (typeof value !== 'string' || value.length !== 32) {
            return false;
        }
        var i, code;
        for (i = 0; i < value.length; ++i) {
            code = value.charCodeAt(i);
            //has to be an uppercase or lowercase character, or a number
            if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57))) {
                return false;
            }
        }
        return true;
    },
    hex: function(value) {
        for (var i = 0; i < value.length; ++i) {
            var code = value.charCodeAt(i);
            //has to be an uppercase or lowercase character a-f, or a number
            if (!((code >= 65 && code <= 70) || (code >= 97 && code <= 102) || (code >= 48 && code <= 57))) {
                return false;
            }
        }
        return true;
    },
    uuid: function(value) {
        if (typeof value !== 'string' || value.length !== 36) {
            return false;
        }
        if (value.charAt(8) !== '-' || value.charAt(13) !== '-' || value.charAt(18) !== '-' || value.charAt(23) !== '-') {
            return false;
        }
        //remove the dashes where they are expected
        var nodashes = value.substr(0, 8) +
            value.substr(9, 4) +
            value.substr(14, 4) +
            value.substr(19, 4) +
            value.substr(24);
        //use the nodashes validator
        return validators.uuidnodashes(nodashes);
    },
    email: function(value) {
        if(value.length>256) {
            return false;
        }
        var emailPattern = /^[a-zA-Z0-9._\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,4}$/;
        return emailPattern.test(value);
    },
    iso8601DateSubset: function(value) {
        if(value.length != 10) {
            return false;
        }
        var iso8601DatePattern = /^([0-9]{4})-(1[0-2]|0[1-9])-(3[0-1]|0[1-9]|[1-2][0-9])$$/;
        if (iso8601DatePattern.test(value)) {
            return !isNaN(Date.parse(value));
        }
        return false;
    },
    year: function(value) {
        if (validators.number(value) && value >= 2000 && value <= 2099) {
            return true;
        }
        return false;
    },
    month: function(value) {
        if (validators.number(value) && value >= 1 && value <= 12) {
            return true;
        }
        return false;
    },
    day: function(value) {
        if (validators.number(value) && value >= 1 && value <= 31) {
            return true;
        }
        return false;
    }
};

var converters = {
    number: function(number) {
        if(validators.number(number)) {
            return number;
        } else if(typeof number === "string") {
            number = parseInt(number, 10);
            if(!isNaN(number)) {
                return number;
            }
        }
        throw (number+" is not a number or a number string");
    },
    "boolean": function(boolval) {
        return !!boolval;
    },
    geo: function(value) {
        var number = converters.number(value);
        if (validators.geo(number)) {
            return number;
        }
        throw "geo values should be numbers between -180 and 180";
    },
    altitude: function(altitude) {
        var number = converters.number(altitude);
        if(validators.altitude(number)) {
            return number;
        }
        throw "altitude values should be a number between -4000 and 10000";
    },
    timestamp: function(timestamp) {
        timestamp = converters.number(timestamp);
        timestamp = Math.round(timestamp);
        if (validators.timestamp(timestamp)) {
            return timestamp;
        }
        throw "timestamp values should be positive numbers";
    },
    year: function(year) {
        year = converters.number(year);
        if (validators.year(year)) {
            return year;
        }
        throw "year should be between 2000 and 2099";
    },
    month: function(month) {
        month = converters.number(month);
        if (validators.month(month)) {
            return month;
        }
        throw "month should be between 1 and 12";
    },
    day: function(day) {
        day = converters.number(day);
        if (validators.day(day)) {
            return day;
        }
        throw "day should be between 1 and 31";
    }
};

var conditions = {

};

module.exports = {
    validators: validators,
    converters: converters,
    conditions: conditions
};
