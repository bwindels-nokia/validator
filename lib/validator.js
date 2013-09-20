/*jshint evil: false, bitwise:false, strict: false, undef: true, white: false, plusplus:false, node:true */



/*
Validation DSL Documentation
----------------------------

The purpose of this DSL is to validate JSON structures.
The rules for validation are also written in JSON.
Structures with arbitrary depth can be validated.

The root value of the JSON structure should always be an object.
For each attribute of the root value you want to validate, you
add the same attribute to the validation rules object.

The value for these attributes in the rules object is an object with
some predefined values. This is called a validation rule. A validation rule
can have one or more attributes. These attributes together with their value
are called validation constraints.
The following validation constraints are supported:

    required, format, length, minLength, maxLength, allowedValues, childRules

An simple example below:

data structure:
    {
        age: 58,
        name: "Snowboard Cat"
    }

validation structure:
    {
        age: {
            required: true,
            format: "number"
        },
        name: {
            format: "string",
            minLength: 1
        }
    }

The validation structure can be read like:
    - we expect a property 'age' on the root object
      that has to be a number and is obligatory.
    - we expect an optional property name on the root
      object that has to be a string and should be at
      least one character long

Supported constraints
---------------------

required : true | false
    checks to see if the value is not undefined. Defaults to false.

format : "format"
    format checks to see if the value corresponds to a given format. An example of formats:

    "date" , "string" , "object" , "array" , "boolean" , "number" , "geo", "timestamp", ...

length: <positive integer>
    if the value is a string, check to see that the length of the string is exactly the given length
    if the value is an array, check to see that the length of the array is exactly the given length

minLength: <positive integer>
    if the value is a string, check to see that the length of the string is at least the given length
    if the value is an array, check to see that the length of the array is at least the given length

maxLength: <positive integer>
    if the value is a string, check to see that the length of the string is not more than the given length
    if the value is an array, check to see that the length of the array is not more than given length

allowedValues: array
    check to see that the value is present in the given array

childRules: object
    This constraint expects that the value is an array or an object.
    You can specify validation rules for the values inside the given array or object.
    You specify the validation rules with an attribute name like you do for
    the collection of validation rules for the root object.

    In case the value that is being validated is an object, the validation rules are applied
    like they are for the root object.

    In case the value that is being validated is an array,
    the rules are iterated in order of declaration and applied to the value
    in the array with the same index.
    If there are less rules than values in the array, the rules
    are repeated (in an array with 4 values and 2 rules the 3rd value
    would be validated by the 1st rule). So in case there is only one rule,
    it is applied to all values in the array.

    Combined with the length, minLength and maxLength
    constraints, it is possible to validate heterogenous fixed-length arrays as well as
    variable-length homogenous arrays.

    childRules constraints can be nested as well (providing they are inside a rule each time),
    so arbitrary depth structures can be validated.

A more complicated example
--------------------------

data structure:
    {
        coordinates: [
            [1,2],
            [4,5],
            [9,7]
        ],
        vehicle: {
            energysource: "muscle",
            wheels: 2,
            weight: 15.4,
            co2emision: 0,001
        }
    }

validation structure:
    {
        coordinates: {
            required: true,
            format: "array",
            minLength: 1,
            childRules: {
                n: {
                    format: "array",
                    length: 2,
                    childRules: {
                        dimension : {
                            format: "number",
                            required: true
                        }
                    }
                }
            }
        },
        vehicle: {
            format: "object",
            childRules: {
                energysource: {
                    allowedValues: ["muscle", "fosilefuel", "electricty", "wind", "heat"]
                },
                wheels: {
                    format: "number",
                    required: true
                },
                weight: {
                    format: "kg",
                    required: true
                },
                co2emision: {
                    format: "fractional"
                }
            }
        }
    }
*/

var Err = require('util/error');
var _ = require('underscore');
var wildcardRuleName = '*';
//declare this variable here so jshint does not complain about using a function before defining it
var processRule;

var formats = require('./validatorformats');
var currentOptions;
var logger = null;

function arrayContains(value, allowedValues) {
    function containsValue(allowedValue) {
        if (allowedValue === value) {
            return true;
        }
    }
    return allowedValues.some(containsValue);
}


function isRequired(rules, value, key) {
    if (typeof value === "undefined") {
        throw new Err.TrackValidationError(key + ' not defined but required!');
    }
}

function isCorrectFormat(rules, value, key) {
    var format = rules.format;
    var validator = formats.validators[format];
    var converter;
    if(currentOptions.convert) {
        converter = formats.converters[format];
    }
    var convertedValue = value;
    if(converter) {
        converter = converter.bind(formats.converters);
        try {
            convertedValue = converter(value);
        } catch(e) {
            if(typeof e === 'string') {
                throw new Err.TrackValidationError(key + ' format error: ' + e);
            }
            throw e;
        }
    } else if(validator) {
        validator = validator.bind(formats.validators);
        if(!validator(value)) {
            throw new Err.TrackValidationError(key + ' is not a valid ' + format + ' value');
        }
    } else {
        throw new Error(format + ' is not a valid format at location ' + key);
    }
    return convertedValue;
}

function isAllowedValue(rules, value, key) {
    var allowedValues = rules.allowedValues;

    if (!arrayContains(value, allowedValues)) {
        throw new Err.TrackValidationError(key + ': ' + value + ' string isn\'t in list of allowedValues; ' + allowedValues);
    }
}

function isInRange(rules, value, key) {
    var from = rules.range[0];
    var to = rules.range[1];
    if (value < from || value > to) {
        throw new Err.TrackValidationError(key + ': ' + value + ' is out of range. Must be in [' + from + "," + to + "]");
    }
}

function isMinLength(rules, value, key) {
    var minLength = rules.minLength;

    if (value.length < minLength) {
        throw new Err.TrackValidationError(key + ': ' + 'Min length not reached. Expected at least: ' + minLength + ' actual:' + value.length);
    }
}

function isLength(rules, value, key) {
    var length = rules.length;

    if (value.length !== length) {
        throw new Err.TrackValidationError(key + ': ' + 'Value has wrong length. Expected: ' + length + ' actual:' + value.length);
    }
}

function isMaxLength(rules, value, key) {
    var maxLength = rules.maxLength;

    if (value.length > maxLength) {
        throw new Err.TrackValidationError(key + ': ' + 'Max length exceeded. Expected less then: ' + maxLength + ' actual:' + value.length);
    }
}

function applyFilterForObject(parentKey, obj, rules) {
    var valueKeys = Object.keys(obj);
    valueKeys.forEach(function(key) {
        if(!rules.hasOwnProperty(key)) {
            if(logger && typeof logger.trace === 'function') {
                var completeKey = parentKey.length===0 ? key : parentKey + '.' + key;
                //logger.trace('validator: filtering out '+completeKey);
            }
            delete obj[key];
        }
    });
}

/**
 * Constructor for class that keeps track of all parent values when processing childRules.
 * Used to support comparison operations.
 */
function ParentStack() {
    this.stack = [];
}

/**
 * Starting new iteration of an object or array. Push it to the stack.
 * @param {object} value value that is being iterated over
 */
ParentStack.prototype.push = function(value) {
    return this.stack.push({});
};

/**
 * Iteration at current level is complete, go one level up.
 */
ParentStack.prototype.pop = function() {
    return this.stack.pop();
};

ParentStack.prototype.peek = function(offset) {
    offset = offset || 0;
    return this.stack[this.stack.length - 1 - offset];
};

ParentStack.prototype.enableFixedChildLength = function() {
    this.peek().fixedChildLength = -1;
};

ParentStack.prototype.processSortingRules = function(key, rule, ruleName, value) {
    var parentInfo = this.peek(1);

    var prevChildValues = parentInfo.prevChildValues;
    var prevChildValue;
    if(!prevChildValues) {
        prevChildValue = undefined;
    } else {
        prevChildValue = parentInfo.prevChildValues[ruleName];
    }

    function setPrevChildValue(ruleName, value) {
        if(!parentInfo.prevChildValues) {
            parentInfo.prevChildValues = {};
        }
        parentInfo.prevChildValues[ruleName] = value;
    }

    if(rule.ascending) {
        if(typeof prevChildValue !== 'undefined' && prevChildValue > value) {
            throw new Err.TrackValidationError(key + ' breaks ascending order');
        }
        setPrevChildValue(ruleName, value);
    }
    if(rule.descending) {
        if(typeof prevChildValue !== 'undefined' && prevChildValue < value) {
            throw new Err.TrackValidationError(key + ' breaks descending order');
        }
        setPrevChildValue(ruleName, value);
    }
    if(rule.noRepeat) {
        if(typeof prevChildValue !== 'undefined' && prevChildValue === value) {
            throw new Err.TrackValidationError(key + ' repeats the value from its previous sibling');
        }
        setPrevChildValue(ruleName, value);
    }
};

ParentStack.prototype.processSiblingRules = function(key, rule, ruleName, value) {
    var parentInfo = this.peek(1);
    if(!parentInfo) {
        return;
    }
    if(parentInfo.fixedChildLength) {
        //the length of the first element still needs to be set
        if(parentInfo.fixedChildLength === -1) {
            parentInfo.fixedChildLength = value.length;
        }
        //if set, compare
        else if(parentInfo.fixedChildLength !== value.length) {
            throw new Err.TrackValidationError(key+ ' has a different length (' + value.length + ') than the previous sibling (' + parentInfo.fixedChildLength + ')');
        }
    }
    this.processSortingRules(key, rule, ruleName, value);
};

/** Iterates over all values in the array with the corresponding rule the value should be validated againsts.
    Assumes rules contains a wildcard rule.
    @param {array} array the values
    @param {object} key-value object with the rules for this array.
            The order of the rules is the order in which they will be applied to the array
    @param {function} callback The function that will be called for each value that should be validated. The function is called with the value, rule name and index
 */
function iterateArrayWithRulesWildcard(array, rules, callback) {
    var ruleNames = Object.keys(rules);
    var wildcardRule = rules[wildcardRuleName];
    var maybeRequiredRuleCount = ruleNames.length - (wildcardRule.required ? 0 : 1);
    var total = Math.max(array.length, maybeRequiredRuleCount);
    var wildcardIndex = ruleNames.indexOf(wildcardRuleName);
    //the last value of i that should use the wildcard rule
    var nonWildcardRulesAtEnd = ruleNames.length - 1 - wildcardIndex;
    var wildcardEndIndex = total - nonWildcardRulesAtEnd - 1;

    var i, ruleIndex, ruleName;
    for(i = 0; i < total; ++i) {
        if(i > wildcardEndIndex) {
            ruleIndex = i - wildcardEndIndex + 1;
        }
        else if(i >= wildcardIndex && i <= wildcardEndIndex) {
            ruleIndex = wildcardIndex;
        } else {
            ruleIndex = i;
        }
        ruleName = ruleNames[ruleIndex];
        callback(array[i], ruleName, i);
    }
}
/** Iterates over all values in the array with the corresponding rule the value should be validated againsts.
    Assumes rules does not contain a wildcard rule.
    @param {array} array the values
    @param {object} key-value object with the rules for this array.
            The order of the rules is the order in which they will be applied to the array
    @param {function} callback The function that will be called for each value that should be validated.
            The function is called with the value, rule name and index
 */
function iterateArrayWithRules(array, rules, callback) {
    var ruleNames = Object.keys(rules);
    var total = Math.max(array.length, ruleNames.length);
    var i, ruleIndex, ruleName;
    for(i = 0; i < total; ++i) {
        ruleIndex = i % ruleNames.length;
        ruleName = ruleNames[ruleIndex];
        callback(array[i], ruleName, i);
    }
}
/** Iterates over all properties in the object with the corresponding rule the value should be validated againsts.
    Assumes rules does not contain a wildcard rule.
    @param {object} obj the object with the to be validated properties
    @param {object} key-value object with the rules for this array.
    @param {function} callback The function that will be called for each value that should be validated.
            The function is called with the property value, rule name and property name
 */
function iterateObjectWithRules(obj, rules, callback) {
    var ruleNames = Object.keys(rules);

    ruleNames.forEach(function(ruleName) {
        callback(obj[ruleName], ruleName, ruleName);
    });
}
/** Iterates over all properties in the object with the corresponding rule the value should be validated againsts.
    Assumes rules contains a wildcard rule.
    @param {object} obj the object with the to be validated properties
    @param {object} key-value object with the rules for this array.
    @param {function} callback The function that will be called for each value that should be validated.
            The function is called with the property value, rule name and property name
 */
function iterateObjectWithRulesWildcard(obj, rules, callback) {
    var valueNames = Object.keys(obj);
    var ruleNames = Object.keys(rules);

    var explicitNames = ruleNames.filter(function(name) {
        return name !== wildcardRuleName;
    });
    var implicitNames = valueNames.filter(function(name) {
       return explicitNames.indexOf(name) === -1;
    });

    var names = explicitNames.concat(implicitNames);

    names.forEach(function(name) {
        var ruleName = name;
        if(!rules[ruleName]) {
            ruleName = wildcardRuleName;
        }
        callback(obj[name], ruleName, name);
    });
}


function selectConditionalRule(rule, value, parentValue, key) {
    if(!Array.isArray(rule)) {
        return rule;
    }
    var conditions = currentOptions.conditions;
    var elseConditions = rule.filter(function(selector) {
        return typeof selector.condition !== 'string';
    });
    var selectedRule;
    var conditionFound = rule.some(function(rule, i) {
        if(!rule.condition) {
            return false;
        }
        if(typeof conditions[rule.condition] !== 'function') {
            throw new Err.TrackValidationError('invalid condition name '+ rule.condition +' at '+key);
        }
        var condition = conditions[rule.condition];
        if(condition.call(conditions, parentValue, value)) {
            selectedRule = rule;
            return true;
        }
        return false;
    });

    if(!conditionFound) {
        if(elseConditions.length === 0) {
            //in case no "else" condition is given, just return empty set of constraints
            selectedRule = {};
        } else {
            selectedRule = elseConditions[0];
        }
    }
    return selectedRule;
}

/**
    *
    * @param {string} key Full (descriptive only) path to the given value. Used in Err.TrackValidationError messages.
    * @param {object} rules Validation rules that should be applied to the given value
    * @param {object|array} value Value to validate against
    */
function processChildRules(parentKey, rules, parentValue, parentStack) {
    var hasWildcard = typeof rules[wildcardRuleName] !== 'undefined';
    var hasMultipleRules = Object.keys(rules).length > 1,
        isArray = Array.isArray(parentValue),
        convertedValue;
    var iterate;
    if (isArray) {
        iterate = hasWildcard ? iterateArrayWithRulesWildcard : iterateArrayWithRules;
    } else {
        iterate = hasWildcard ? iterateObjectWithRulesWildcard : iterateObjectWithRules;
    }

    //initialize the parent stack if it was not passed
    parentStack = parentStack || new ParentStack();
    parentStack.push();

    iterate(parentValue, rules, function(value, ruleName, valueName) {
        var key, rule = rules[ruleName];
        if (isArray) {
            //include the rulename in the index if there is more than one rule defined
            if (hasMultipleRules) {
                key = parentKey + '[' + valueName + ',rule=' + ruleName + ']';
            } else {
                key = parentKey + '[' + valueName + ']';
            }
        } else {
            key = parentKey + (parentKey.length ? '.' : '') + valueName;
        }
        rule = selectConditionalRule(rule, value, parentValue, key);

        convertedValue = processRule(key, rule, ruleName, value, parentStack);
        // HACK && RADAR [CK]: if an object is uploaded and doesnt contain the desired properties, they are getting setted as
        // obj.property = undefined  and saved into the db, when exporting data, this unwanted data gets out of the db with null
        // values and the import breaks, does the convert flag should create also falsy values?
        if(typeof(convertedValue) !== "undefined" && currentOptions.convert) {
            parentValue[valueName] = convertedValue;
        }
    });
    //apply filter option, only if we are iterating an object (and not an array)
    if(currentOptions.filter && !isArray && !hasWildcard) {
        applyFilterForObject(parentKey, parentValue, rules);
    }

    parentStack.pop();
}

/**
   * Check all given constraints in rule against value. Also decends into childRules.
   *
   * @param {string} key Full (descriptive only) path to the given value. Used in error messages.
   * @param {object} rule Validation rule to validate the given value
   * @param {object} value Value to validate against, can be any kind of value
   * @param {ParentStack} parentStack parent values use for comparing against nephews
   */
processRule = function processRule(key, rule, ruleName, value, parentStack) {
    if(currentOptions.debug) {
        var ruleCopy = JSON.parse(JSON.stringify(rule));
        if(ruleCopy.childRules) {
            ruleCopy.childRules = '...';
        }
        console.log('processing ' + key + " with rule " + JSON.stringify(ruleCopy));
    }
    if (rule.required) {
        isRequired(rule, value, key);
    }
    //the rest of the tests don't make sense for undefined, so bail out early
    if (typeof value === "undefined") {
        return;
    }
    var convertedValue = value;
    if (rule.format) {
        convertedValue = isCorrectFormat(rule, value, key);
    }

    if (rule.allowedValues) {
        isAllowedValue(rule, value, key);
    }

    if (rule.range) {
        isInRange(rule, value, key);
    }

    if (rule.minLength) {
        isMinLength(rule, value, key);
    }

    if (rule.maxLength) {
        isMaxLength(rule, value, key);
    }

    if (rule.length) {
        isLength(rule, value, key);
    }

    if(rule.fixedChildLength) {
        parentStack.enableFixedChildLength();
    }

    parentStack.processSiblingRules(key, rule, ruleName, value);

    // Recursion into tree
    if (rule.childRules) {
        if(typeof value !== 'object') {
            throw new Err.TrackValidationError(key+' is expected to be an object or array');
        }
        processChildRules(key, rule.childRules, value, parentStack);
    }

    return convertedValue;
};

var defaultOptions = {
    filter: false,
    debug: false,
    convert: false
};

/**
 * @param {object} data The object literal to validate
 * @param {object} rules The validation rules according to the documented validation DSL
 */
function validate(data, rules, options) {
    currentOptions = _.extend({}, defaultOptions, options);
    processChildRules('', rules, data);
}

module.exports = {
    validate: validate
};
