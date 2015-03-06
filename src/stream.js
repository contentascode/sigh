import _ from 'lodash'
import Promise from 'bluebird'
import Bacon from 'baconjs'

/**
 * Adapt the events in a stream by running callback on each event in a new value.
 * @return {Bacon} stream that will pass the adapted events.
 * @param {Function} callback To adapt event, can also return a promise to delay the stream.
 */
export function mapEvents(stream, callback) {
  return stream.flatMapConcat(events => Bacon.fromPromise(Promise.all(events.map(callback))))
}

/**
 * Like traditional debounce but buffer all values together and pass them along the
 * stream as an array.
 * @param {Bacon} stream debounce this stream.
 * @param {Number} delay debounce delay in milliseconds
 */
export function bufferingDebounce(stream, delay) {
  // I feel like there's a better way to do this...
  var buffer = []
  return stream.flatMapLatest(value => {
    buffer.push(value)
    return Bacon.later(delay, buffer)
  })
  .map(buffer => {
    var copy = buffer.slice(0)
    buffer.length = 0
    return copy
  })
}

/**
 * Adapt a stream to forward the current state of the output tree as an array of Event objects relating to the most recent event for each currently existing tree path (event type will be "add" or "change").
 * @param {Bacon} stream Stream to coalesce.
 */
export function coalesceEvents(stream) {
  var eventCache = {} // event by relative path

  return stream.map(events => {
    events.forEach(event => {
      switch (event.type) {
        case 'remove':
          delete eventCache[event.projectPath]
          break;
        case 'change':
          eventCache[event.projectPath] = event
          break;
        case 'add':
          eventCache[event.projectPath] = event
          break
        default:
          throw Error(`Bad event type ${event.type}`)
      }
    })

    return _.values(eventCache)
  })
}

/**
 * Turn a pipeline into a stream.
 * @param {Boolean} watch Whether to pass "watch" to plugins (i.e. sigh -w was used).
 * @param {Array} pipeline Array of operations representing pipeline.
 * @param {Number} treeIndex First tree index, defaulting to 1.
 */
export function pipelineToStream(watch, pipeline, treeIndex = 1) {
  var firstOp = pipeline.shift()
  var { plugin } = firstOp
  var opData = { stream: null, watch, treeIndex }
  var sourceStream = plugin.apply(this, [ opData ].concat(firstOp.args))

  return _.reduce(pipeline, (stream, operation) => {
    var { plugin } = operation
    opData = { stream, watch, treeIndex: opData.nextTreeIndex || opData.treeIndex + 1 }
    return plugin.apply(this, [ opData ].concat(operation.args))
  }, sourceStream)
}