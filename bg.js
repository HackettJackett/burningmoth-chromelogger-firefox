"use strict";
/**
 * Background script.
 * All the routine heavy lifting should be done here and the results coordinated betweent dev.js devtools script and log.js content script or panel.js devtools.panel UI.
 */

/**
 * Collection of keyed tab objects connected when devtools are opened on a tab.
 * @since 1.0
 * @var object tabs
 */
const tabs = {};


/**
 * Return tab id integer from port.name.
 * @since 1.0
 * @param runtime.Port port
 * @return integer
 */
function tabIdFromPort( port ) {
	return parseInt( port.name.substr(3) );
}


/**
 * Return tabs object key from id integer.
 * @since 1.0
 * @param integer tabId
 * @return string
 */
function tabKeyFromId( tabId ) {
	return 'tab'.concat(tabId);
}


/**
 * Returns a tab object from id.
 * @since 1.0
 * @param integer
 * @return Tab|undefined
 */
function tabFromId( tabId ) {
	return tabs[ tabKeyFromId( tabId ) ];
}


/**
 * Tab class.
 * @since 1.0
 * @since 2.0
 *	- removed processContentUrl() method, functionality moved to log.js
 * @since 3.0
 * 	- removed fallback functionality (no longer supported by Firefox!)
 * 	- added devtools.panel functionality
 */
class Tab {

	/**
	 * @since 1.0
	 * @param integer tabId
	 * @param runtime.Port port
	 */
	constructor( tabId, port ){

		/**
		 * Tab id.
		 * @since 1.0
		 * @var integer
		 */
		this.id = tabId;

		/**
		 * Incoming connection from devtools being loaded / set by runtime.onConnect listener.
		 * @since 1.0
		 * @var runtime.Port
		 */
		this.devPort = port;

		/**
		 * Contains pending data while tab main frame is loading.
		 * @since 1.0
		 * @var array
		 */
		this.pending = [];

		/**
		 * Reflects tab DOMReady state. When true the tab is ready to receive messages.
		 * @since 1.1
		 * @var bool
		 */
		this.ready = false;

		/**
		 * Sends header details to devtools which, if open, will send them back to onDevPortMessage()
		 * @since 1.0
		 * @param webRequest.onHeadersReceived details
		 * @note This way we're only processing headers when the user can see output from them logged to the web console.
		 * @note Setting up an anonymous function this way in order to make the handler for this tab distinct from that of others so the event handler can tell difference.
		 */
		this.onHeadersReceived = function( details ) {
			tabs[ tabKeyFromId( details.tabId ) ].devPort.postMessage( details );
		}

		/**
		 * Is panel.html displayed?
		 * @var bool
		 * @since 3.0
		 */
		this.panel = false;

	}

	/**
	 * Logs data to log.js or panel ...
	 * @since 1.0
	 * @since 1.2
	 *	- send data back on port if Tab.fallback == true
	 * @since 3.0
	 * 	- removed Tab.fallback condition, behavior.
	 * 	- added Tab.panel condition, behavior.
	 * 	- attempts to send data to panel or tab before storing to pending and send later to panel or tab (whichever resolves first)
	 * @param object data
	 *	- ChromeLogger Data
	 */
	log( data ){

		// can't send to panel or tab ? save to pending ...
		if ( ! ( this.sendPanel(data) || this.sendTab(data) ) ) this.pending.push( data );

	}

	/**
	 * Send message data to tab log.js if ready.
	 * @since 3.0
	 * @param object data
	 * @return bool
	 */
	sendTab( data ){
		if ( this.ready ) browser.tabs.sendMessage( this.id, data );
		return this.ready;
	}

	/**
	 * Send message data to panel if open.
	 * @since 3.0
	 * @param object data
	 * @return bool
	 */
	sendPanel( data ){
		if ( this.panel ) {
			data.tabId = this.id;
			browser.runtime.sendMessage( data );
		}
		return this.panel;
	}

	/**
	 * Clear panel console of messages.
	 * @since 3.0
	 */
	clearPanel(){
		this.sendPanel({args:[['clear']]});
	}

	/**
	 * Toggle panel.
	 * @since 3.0
	 * @param bool toggle
	 */
	togglePanel( toggle ){
		this.sendPanel({toggle:toggle});
	}

}


/**
 * Removes a corresponding tab and events / used as tabs.onRemoved handler too.
 * @since 1.0
 * @param integer tabId
 */
function onTabRemoved( tabId ) {

	const
	tabKey = tabKeyFromId( tabId ),
	tab = tabs[ tabKey ];

	if ( tab ) {

		// remove panel console ...
		tab.togglePanel(false);

		// disconnect ports ...
		tab.devPort.disconnect();

		// remove handler ...
		browser.webRequest.onHeadersReceived.removeListener( tab.onHeadersReceived );

		// remove tab ...
		delete tabs[ tabKey ];

	}

}


/**
 * Process ChromeLogger data rows into console args.
 * @since 1.5
 * @since 1.7
 * 	- flexible support for different row.column arrangments
 * @param ChromeLoggerData object data
 */
function processChromeLoggerData( data ) {

	return new Promise(( resolve )=>{

		// load options, process data, pass to Tab.log() ...
		browser.storage.sync.get(DEFAULT_OPTIONS).then(opts=>{

			// ensure lowercase columns array ...
			data.columns = (
				! data.columns
				|| ! Array.isArray(data.columns)
				? [ 'log', 'backtrace', 'type' ]
				: data.columns.map(column=>column.toLowerCase())
			);

			// map to rows array to console method args ...
			data.args = data.rows.map(( row )=>{

				// convert row to object w/columns mapped to properties ...
				row = row.reduce(function( row, value, index ){
					row[ data.columns[ index ] ] = value;
					return row;
				}, { 'log': [], 'backtrace': false, 'type': 'log' });

				let

				// console method / @see https://developer.mozilla.org/en-US/docs/Web/API/Console
				method = row.type,

				// console.[method] arguments ...
				args = row.log,

				// file:line ...
				fileline = row.backtrace,

				// substitution pattern ...
				tmpl_pattern = '',

				// substition arguments ...
				tmpl_args = [];

				// ensure method is valid ...
				if (
					typeof method !== 'string'
					|| ! console[ method ]
				) method = 'log';

				// ensure arguments is array ...
				if ( ! Array.isArray(args) ) args = [ args ];

				// assertion ? ...
				if ( method === 'assert' ) {

					// resolves true ? log nothing ...
					if ( args.shift() ) return false;

					// false ! log error ...
					else method = 'error';

				}

				// process arguments ...
				if (
					args.length > 0
					&& [ 'debug', 'log', 'info', 'warn', 'error', 'group', 'groupCollapsed' ].includes(method)
				) {

					// detect, passthru an existing substitution pattern ...
					if (
						typeof args[0] == 'string'
						&& /(^|[^%])%(s|d|i|f|o|O|c|\.\d+(d|i|f))/.test(args[0])
					) {
						tmpl_pattern = args.shift();
						tmpl_args = args;
					}

					// generate pattern ...
					else {

						// make array ...
						tmpl_pattern = [];

						// populate pattern and args arrays ...
						args.forEach(( arg )=>{

							switch ( typeof arg ) {

								case 'string':
									tmpl_pattern.push('%c%s%c');
									tmpl_args.push(
										opts.console_substitution_styles[(
											method == 'groupCollapsed'
											? 'group'
											: method
										)],
										// unescape any passed substitution patterns ...
										arg.replace(/%{2,}(s|d|i|f|o|O|c|\.\d+(d|i|f))/g, '%$1'),
										''
									);
									break;

								case 'number':
									tmpl_pattern.push('%c%s%c');
									tmpl_args.push(opts.console_substitution_styles.number, arg, '');
									break;

								case 'object':

									// resolves to true (not null or undefined) and has special class name property ? prepend and remove ...
									if ( arg && arg.hasOwnProperty('___class_name') ) {

										tmpl_pattern.push('%c%s%c');
										tmpl_args.push(opts.console_substitution_styles.classname, arg.___class_name, '');

										delete arg.___class_name;

									}
									// no break, passthru ...

								default:
									tmpl_pattern.push('%o');
									tmpl_args.push(arg);
									break;

							}

						});

						// stringify pattern ...
						tmpl_pattern = tmpl_pattern.join(' ');

					}

				}

				// straight arguments for all other console methods, no backtrace ...
				else {
					tmpl_args = args;
					fileline = false;
				}

				// append fileline ...
				if ( fileline ) {

					// add a space if there is other pattern content ...
					if ( tmpl_pattern ) tmpl_pattern = tmpl_pattern.concat(' ');

					tmpl_pattern = tmpl_pattern.concat('%c%s');
					tmpl_args.push(opts.console_substitution_styles.fileline, fileline);

				}

				// prepend string pattern to arguments ...
				if ( tmpl_pattern ) tmpl_args.unshift( tmpl_pattern );

				// prepend method ...
				tmpl_args.unshift( method );

				// return processed arguments ...
				return tmpl_args;

			}).filter( args => args !== false );

			// return processed data ...
			resolve(data);

		})
		.catch(console.error);

	});

}


/**
 * Tab.devPort runtime.Port.onMessage event handler.
 * Catches and processes header details sent by Tab.onHeadersReceived() handler to and passed back from a verified open devtools.
 *
 * @since 1.0
 * @since 1.5
 *	- accept rows array retrieved from document by devtools ...
 * @since 1.7
 *	- also checks for X-ChromePHP-Data header
 *	- logs details url, method separately as chromelogger data
 * @since 2.0
 *	- removed capturing details.rows from dev.js
 * @since 3.0
 * 	- added details.panel behavior
 *
 * @param tabs.onHeadersReceived details
 */
function onDevPortMessage( details ) {

	const tab = tabFromId( details.tabId );

	// details object passed through the open devtools ...
	if ( details.responseHeaders ) {

		// headers to process data from ...
		var headers = [ 'x-chromelogger-data', 'x-chromephp-data' ];

		// parse headers ...
		details.responseHeaders.forEach(( header )=>{

			// ChromeLogger data ! decode and process ...
			if ( headers.includes( header.name.toLowerCase() ) ) {

				// load options, process ...
				browser.storage.sync.get(DEFAULT_OPTIONS).then(opts=>{

					// display data url ? log it as chromelogger data ...
					if ( opts.display_data_url ) processChromeLoggerData({
						rows: [[[
							'%c%s %s',
							opts.console_substitution_styles.header,
							details.method,
							details.url
						]]]
					}).then(data=>{
						tabFromId( details.tabId ).log( data );
					});

					// attempt to parse data from header ...
					try {

						// base64 decode / parse JSON ...
						var data = JSON.parse( atob( header.value ) );

						// process and log ...
						processChromeLoggerData( data ).then(data=>{
							tabFromId( details.tabId ).log( data );
						});

					} catch( error ) { console.error(error); }

				});

			}

		});

	}

	// toggle panel ? ...
	else if ( typeof details.panel !== undefined ) {

		// set panel property ...
		tab.panel = Boolean( details.panel );

		// open ? ...
		if ( tab.panel ) {

			// prepare panel console ...
			tab.togglePanel(true);

			// send pending items to panel ...
			while ( tab.pending.length ) tab.sendPanel( tab.pending.shift() );

		}

	}

}


/**
 * Tab.devPort runtime.Port.onDisconnect event handler.
 * @since 1.0
 * @param runtime.Port port
 */
function onDevPortDisconnect( port ) {

	// report error ...
	if ( port.error ) console.error('Disconnected due to error:', port.error.message);
	else console.error( port.name, 'has been disconnected!' );

	// remove tab if any exists ...
	onTabRemoved( tabIdFromPort(port) );

}


/**
 * Listener / Assigns tab object and handlers connecting devtools context when devtools are opened on a tab.
 *
 * @since 1.0
 * @since 1.7
 *	- removed onHeadersReceived listener "types" to process headers from ALL resources.
 *
 * @param runtime.Port port
 */
browser.runtime.onConnect.addListener(( port )=>{

	let
	tabId = tabIdFromPort(port),
	tabKey = port.name,
	tab = tabs[ tabKey ];

	// ports change when devtools are closed/opened so [re]assign port event handlers ...
	port.onDisconnect.addListener(onDevPortDisconnect);
	port.onMessage.addListener(onDevPortMessage);

	// no tab ? create it ...
	if ( ! tab ) tab = tabs[ tabKey ] = new Tab( tabId, port );

	// update existing port ...
	else tab.devPort = port;

	// no tab specific anon (IMPORTANT!) listener assigned to catch headers ? assign now ...
	if ( ! browser.webRequest.onHeadersReceived.hasListener( tab.onHeadersReceived ) ) {
		browser.webRequest.onHeadersReceived.addListener(
			tab.onHeadersReceived,
			{
				"urls": [ "<all_urls>" ],
				"tabId": tabId
			},
			[ "responseHeaders" ]
		);
	}

});


/**
 * Listener / receives ChromeLoggerData objects from log.js parsed from document.
 * @since 2.0
 * @param ChromeLoggerData details
 */
browser.runtime.onMessage.addListener(( details )=>{
	processChromeLoggerData( details ).then(data=>{
		tabFromId( details.tabId ).log( data );
	});
});


/**
 * Listener / Assigns onTabRemoved handler for tab removal events.
 * @note Tried to track closing browser.windows events but it doesn't work as of 2017Oct08
 * @todo Whenever a devtools close event becomes available, bind to that instead of this!
 * @since 1.0
 * @param integer tabId
 */
browser.tabs.onRemoved.addListener(onTabRemoved);


/**
 * Listener / opens corresponding panel console when active tab is changed.
 * @since 3.0
 * @param object info
 */
browser.tabs.onActivated.addListener(( info )=>{
	const tab = tabFromId(info.tabId);
	if ( tab ) tab.togglePanel(true);
});


/**
 * Listender / Reset tab before it updates.
 * @since 1.1
 * @since 3.0
 * 	- added clear panel
 * 	- removed deprecated fallback condition
 */
browser.webNavigation.onBeforeNavigate.addListener(( details )=>{
	let tab = tabFromId( details.tabId );
	if ( tab && details.frameId == 0 ) {
		tab.ready = false;
		tab.clearPanel();
	}
});


/**
 * Inject log.js and update tab ready state.
 * @since 1.1
 * @since 1.2
 *	- added fallback to devtools reporting if script injection fails
 * @since 1.5
 *	- finally tell tab to process loaded DOM content for additional info to log
 * @since 2.0
 *	- moved DOM content processing from dev.js to log.js
 * @since 3.0
 * 	- removed Tab.fallback behavior as Firefox updated to block it
 */
browser.webNavigation.onDOMContentLoaded.addListener(( details )=>{

	const tab = tabFromId( details.tabId );

	if ( tab && details.frameId == 0 ) {

		/* @warning browser.scripting (which would be nice here) requires manifest 3 and a complete overhaul of processes and inclusion of a more obtrusive permission system (TL;DR: it breaks the absolute shit out of everything) */

		// inject log.js to receive messages sent to tab ? ...
		browser.tabs.executeScript( details.tabId, { file: '/log.js' })
		.then(()=>{

			// update ready state ...
			tab.ready = true;

			// send any pending items ...
			while ( tab.pending.length ) tab.sendTab( tab.pending.shift() );

			// tell tab to parse any items from the document itself ...
			tab.sendTab({ tabId: details.tabId });

		}).catch(( failure )=>{

			//console.error(failure);

			// panel not open ? notify user to do that now ...
			if ( ! tab.panel ) browser.notifications.create(null, {
				type: "basic",
				iconUrl: browser.runtime.getURL("icon.svg"),
				title: browser.runtime.getManifest().name,
				message: `Open the ${browser.runtime.getManifest().name} DevTools panel to view messages logged by this page.`
			});

		});

	}

});


