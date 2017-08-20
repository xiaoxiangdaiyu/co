
/**
 * co
 * Generator函数的自动执行器，会返回一个promise，使用可以如下。
 * @example
 * co(gen).then(function (){
 *     console.log('函数执行完成');
 *   })
 * 原理：
 * 接收Generator 函数作为参数，返回一个 Promise 对象
 * 然后将next方法包装为一个新的promise，依次执行
 * onFulfilled方法获取当前Generator执行状态的next执行结果
 * next方法对执行状态及next属性加以判断处理
 *     状态为done则执行resolve如果是主promise，则resolve为最外层的回调，否则是onFulfilled
 *     未完成 执行co新建分支promise并将onFulfilled作为回调传入，执行完成，会回到主promise
 */
/**
 * 保存slice方法，后面多次用到
 */

var slice = Array.prototype.slice;

/**
 * 导出co
 */

module.exports = co['default'] = co.co = co;

/**
 * 调用将 generator 方法包装为promise。
 */

co.wrap = function (fn) {
  createPromise.__generatorFunction__ = fn;
  return createPromise;
  function createPromise() {
    return co.call(this, fn.apply(this, arguments));
  }
};

/**
 * 执行generator，返回一个promise对象
 * 即将整个fn包在主promise中
 */

function co(gen) {
  // 当前执行环境上下文
  var ctx = this;
  // 获取参数
  var args = slice.call(arguments, 1);
 
  return new Promise(function(resolve, reject) {
    /**
     * 生成一个gen实例
     * 如果不是gen函数，结束并执行resolve回调
     */
    if (typeof gen === 'function') gen = gen.apply(ctx, args);
    if (!gen || typeof gen.next !== 'function') return resolve(gen);
   
    onFulfilled();

    function onFulfilled(res) {
      var ret;
      try {
       /**
        * 执行next，获取执行结果 
        */ 
        ret = gen.next(res);
      } catch (e) {
        return reject(e);
      }
      // 调用实现自动执行的关键函数，next
      next(ret);
      return null;
    }

    /**
     * 失败回调，不多加关心
     */
    function onRejected(err) {
      var ret;
      try {
        ret = gen.throw(err);
      } catch (e) {
        return reject(e);
      }
      next(ret);
    }

    /**
     * next函数的实现
     * 一句话总结：如果为done，则value传入resolve并执行，否则调用co生成子promise，继续执行
     */
    function next(ret) {
      // done return 并执行reslove，即回到上层promise如果为主promise，则执行完成
      if (ret.done) return resolve(ret.value);
      // 执行结果创建子promise，不同数据结构实现方式不同
      var value = toPromise.call(ctx, ret.value);
      // 将onFulfilled作为resolve传入，确保子promise执行完成之后回到主promise。
      // 这样next执行链创建完成
      if (value && isPromise(value)) return value.then(onFulfilled, onRejected);
      return onRejected(new TypeError('You may only yield a function, promise, generator, array, or object, '
        + 'but the following object was passed: "' + String(ret.value) + '"'));
    }
  });
}

/**
 * 将obj转换成promise
 * obj无非为以下几种类型:
 * 1、非object的基本数据类型===>直接返回
 * 2、promise===>直接返回
 * 3、Generator对象和方法===> co调用
 * 4、Function 回调函数===>thunkToPromise
 * 5、Object  ===>objectToPromise 
 */

function toPromise(obj) {
  if (!obj) return obj;
  if (isPromise(obj)) return obj;
  if (isGeneratorFunction(obj) || isGenerator(obj)) return co.call(this, obj);
  if ('function' == typeof obj) return thunkToPromise.call(this, obj);
  if (Array.isArray(obj)) return arrayToPromise.call(this, obj);
  if (isObject(obj)) return objectToPromise.call(this, obj);
  return obj;
}

/**
 * thunk函数转成promise
 */

function thunkToPromise(fn) {
  var ctx = this;
  return new Promise(function (resolve, reject) {
    // 直接执行fn，回调函数中控制状态
    fn.call(ctx, function (err, res) {
      // err  reject
      if (err) return reject(err);
      // 多余的参数作为res返回到 resolve函数中
      if (arguments.length > 2) res = slice.call(arguments, 1);
      resolve(res);
    });
  });
}

/**
 * map遍历array，把所有的item都转换为promise
 * 数组转换直接使用Promis.all获取所有itemresolve之后值的实例
 */

function arrayToPromise(obj) {
  return Promise.all(obj.map(toPromise, this));
}

/**
 * 对象转换为promise
 * 对象属性可能是多种类型，所以利用Object.keys()对其属性进行遍历，转换为promise并push到数组汇总
 * 然后将该数组转换为Promise
 */

function objectToPromise(obj){
  var results = new obj.constructor();
  // 获取属性数组，并根据其进行遍历
  var keys = Object.keys(obj);
  // 保存所有promise的数组
  var promises = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    // 转换
    var promise = toPromise.call(this, obj[key]);
    // 转换之后为promise之后，将其push到
    if (promise && isPromise(promise)) defer(promise, key);
    // 非promise属性，直接赋给results
    else results[key] = obj[key];
  }
  return Promise.all(promises).then(function () {
    return results;
  });
  /**  
   * 给promise实例增加resolve方法并push到数组中
   * resolve方法就是给results对应的key赋值
  */
  function defer(promise, key) {
    // predefine the key in the result
    results[key] = undefined;
    promises.push(promise.then(function (res) {
      results[key] = res;
    }));
  }
}

/**
 * obj 是否promise
 * 利用promise.then存在且为function
 */

function isPromise(obj) {
  return 'function' == typeof obj.then;
}

/**
 * obj是否Generator
 * 利用Generator的next 和 throw 两属性为Fuction的特点加以判断
 */

function isGenerator(obj) {
  return 'function' == typeof obj.next && 'function' == typeof obj.throw;
}

/**
 * 是否Generator方法
 * 利用constructor的name和displayName属性。
 * @example
 * var a = {}
 * a.constructor === Object
 * a.constructor.name // "Object"
 */
 
function isGeneratorFunction(obj) {
  var constructor = obj.constructor;
  if (!constructor) return false;
  if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true;
  return isGenerator(constructor.prototype);
}

/**
 * 判断是否干净对象 
 * 利用constructor 属性。
 * @example 
 * Object.constructor === Object
 */

function isObject(val) {
  return Object == val.constructor;
}