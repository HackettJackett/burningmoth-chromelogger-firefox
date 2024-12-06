"use strict";
/**
 * Output panel scripts.
 */

/**
 * Toggles .group.collapsed elements on click
 * @param PointerEvent event
 */
function groupCollapsed( event ){

	event.stopPropagation();

	let element = event.target;

	if ( element.classList.contains('group') ) element.classList.toggle('collapsed', !element.classList.contains('collapsed'));

}


/**
 * Toggles .object.expanded elements on click
 * @param PointerEvent event
 */
function toggleExpanded( event ){

	// no bubble click event !
	event.stopPropagation();

	// element clicked on ...
	let element = event.target;

	// find nearest object or block element ...
	while ( ! ( element.classList.contains('object') || element.classList.contains('block') ) ) element = element.parentElement;

	// toggle expanded class ...
	element.classList.toggle('expanded', !element.classList.contains('expanded'));

}


/**
 * Appends (or replaces) content to element.
 * @note this is to replace element.innerHTML which makes web-ext lint pissy about security, performance or some such nonsense
 * @param HTMLElement parentElement
 * @param string content
 * @param bool clear
 */
function appendTo( parentElement, content, clear = false ) {

	// clear element ? ...
	if ( clear ) while ( parentElement.childNodes.length ) parentElement.childNodes.item(0).remove();

	// append content to element ...
	Array.from(( new DOMParser() ).parseFromString(content, 'text/html').body.childNodes).forEach(childElement=>parentElement.append(childElement));

}


/**
 * Encode HTML characters.
 * @param string str
 * @param bool quotes
 * @return string
 */
function encodeHtml( str, quotes = false ){
	str = String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	if ( quotes ) str = str.replace(/\"/g, '&quot;').replace(/\'/g, '&apos;');
	return str;
}


/**
 *
 * @param HTMLElement element
 * @param integer depth
 * @return string html
 */
function encodeXml( element, depth = 0 ) {

	const tab = "\n".padEnd(depth * 4, ' ');
	let html = tab, name;

	// tag ...
	if ( element.nodeType === 1 ) {

		// node name ...
		name = '<span class="tag">' + element.localName + '</span>';
		if ( element.prefix ) name = '<span class="namespace">' + element.prefix + ':</span>' + name;

		// html value to return ...
		html += '<span class="bracket">&lt;</span>' + name;

		// attributes ...
		for ( let i = 0; i < element.attributes.length; i++ ) {

			const attr = element.attributes.item(i);

			html += ' ';

			if ( attr.prefix ) html += '<span class="namespace">' + attr.prefix + ':</span>';

			html += '<span class="attribute">' + attr.localName + '=</span><span class="string">&quot;' + encodeHtml(attr.value, true) + '&quot;</span>';

		}

		html += '<span class="bracket">&gt;</span>';

		// child nodes ...
		if ( element.childNodes.length ) {

			html += '<span class="block">';

			element.childNodes.forEach(child=>{ html += encodeXml(child, depth + 1) });

			html += tab + '</span>';

		}

		html += '<span class="bracket">&lt;/</span>' + name + '<span class="bracket">&gt;</span>';

	}

	// content ...
	else {
		html += encodeHtml(element.nodeValue, true);
	}

	return html;

}


/**
 * Interprete data to html
 * @param mixed json
 * @return string html
 */
function encodeObject( json ) {

	// get class from type ...
	let cls = typeof json;

	// string maybe xml ? ...
	if (
		cls === 'string'
		&& /^\s*<.*>\s*$/.test(json)
	) {

		// parse into XMLDocument ...
		let doc = ( new DOMParser() ).parseFromString(json.trim(), 'text/xml');

		// success ? replace json, cls ...
		if ( ! doc.querySelector('parsererror') ) {
			cls = 'object';
			json = doc;
		}

	}

	// scalar ? return ...
	if ( [ 'string', 'number', 'boolean' ].includes(cls) ) return '<span class="' + cls + '">' + json + '</span>';
	else if ( cls === 'undefined' ) return '<span class="null">' + cls + '</span>';
	else if ( json === null ) return '<span class="null">null</span>';

	// xml object parsed by bg.js maybeParseXML() ...
	if ( json instanceof XMLDocument ) json = encodeXml(json.documentElement);

	// json object ...
	else {

		// encode JSON ...
		json = JSON.stringify(json, null, 4);

		json
		= encodeHtml(json)
		.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function( match ){

			cls = 'number';

			if (/^"/.test(match)) {

				// key ? ...
				if (/:$/.test(match)) {

					cls = 'key';

					// unquote variablesque names ...
					match = match.replace(/\"([a-zA-Z0-9_]+)\":/g, "$1:");

				}

				// value ...
				else cls = 'string';

				// strip slashes ...
				match = match.replace(/\\(.)/g, "$1");

			} else if (/true|false/.test(match)) {
				cls = 'boolean';
			} else if (/null/.test(match)) {
				cls = 'null';
			}

			return '<span class="' + cls + '">' + match + '</span>';
		})
		.replace(/(\{|\[)(\n)/g, `<span class="bracket">$1</span><span class="block">$2`)
		.replace(/(\n\s*)(\}|\])/g, `$1</span><span class="bracket">$2</span>`);

	}

	return '<span class="object">' + json + '</span>';
}


/**
 * Parse a number value or zero
 * @param mixed num
 * @return Number
 */
function getNumber( num ) {
	num = Number(num);
	return (
		Number.isNaN(num)
		? 0
		: num
	);
}


/**
 * True for Objects
 * @param mixed value
 * @return bool
 */
function isCompound( value ) {
	return (
		typeof value === 'object'
		&& value !== null
	);
}


/**
 * True for NOT Objects
 * @param mixed value
 * @return bool
 */
function isScalar( value ) {
	return ! isCompound(value);
}


/**
 * True for Object that's not Array
 * @param mixed value
 * @returns
 */
function isObject( value ) {
	return (
		isCompound(value)
		&& ! Array.isArray(value)
	);
}

/**
 * Render console arguments
 * @param array msgs
 * @param integer tabId
 */
function processConsoleMessages( msgs, tabId ) {

	let consoleElement = getConsole(tabId);

	msgs.forEach(args=>{

		let method = args.shift();

		// groupEnd ? reassign console element ...
		if ( method == 'groupEnd' ) {

			let parentElement = consoleElement.parentElement.parentElement;

			if ( parentElement && parentElement.tagName == 'UL' ) consoleElement = parentElement;
			else console.error('groupEnd invalid!');

			return;

		}

		// clear the console, reset ...
		else if ( method == 'clear' ) {

			// reset the console ...
			consoleElement = getConsole(tabId);

			// empty the console ...
			appendTo(consoleElement, '', true);

			return;

		}

		let
		msg = args.shift(),
		itemElement = document.createElement('li');

		// console.assert ? ...
		if ( method === 'assert' ) {
			if ( msg ) return;
			else {
				method = 'log';
				msg = args.shift();
			}
		}

		// console.table ? ...
		if (
			method === 'table'
			&& isCompound(msg)
		) {

			let
			mask = args.shift(), // columns parameter, optional array of keys of those to include
			rows = msg,
			cols = [];

			msg = '<table>';

			// render array as table ...
			if ( Array.isArray(rows) ) {

				// distill keys from rows ...
				rows.forEach(row=>{
					if ( Array.isArray(row) ) cols = cols.concat( Array.from( row.keys() ) );
					else if ( isObject(row) ) cols = cols.concat( Object.keys(row) );
					else cols.push('Values');
				});

				// unique keys ...
				cols = cols.filter(( value, index, self )=>{ return self.indexOf(value) === index; });

				// mask columns (always keep Values column if exists!) ...
				if ( Array.isArray(mask) ) cols = cols.filter(k=>{ return k == 'Values' || mask.includes(k); });

				// order columns ...
				cols = cols.sort(( a, b )=>{

					// put scalar values first always ...
					if ( b === 'Values' ) return 1;

					return (
						a == b
						? 0
						: (
							a > b
							? -1
							: 1
						)
					);

				});

				msg += '<thead><tr><th>(index)</th>';

				cols.forEach(k=>{
					msg += '<th>' + k + '</th>';
				});

				msg += '</tr></thead><tbody>';

				rows.forEach(( row, i )=>{

					msg += '<tr><th>' + i + '</th>';

					cols.forEach(k=>{

						msg += '<td>';

						if (
							isCompound(row)
							&& typeof row[ k ] !== 'undefined'
						) msg += encodeObject( row[ k ] );

						else if (
							k === 'Values'
							&& isScalar(row)
						) msg += encodeObject(row);

						msg += '</td>';

					});

					msg += '</tr>';

				});

				msg += '</tbody>';

			}

			// render object as table ...
			else {

				msg += '<thead><tr><th>(index)</th><th>Values</th></tr></thead><tbody>';

				for ( const [ key, value ] of Object.entries(rows) ) {

					if (
						Array.isArray(mask)
						&& ! mask.includes(key)
					) continue;

					msg += '<tr><th>' + key + '</th><td>' + encodeObject(value) + '</td></tr>';

				}

				msg += '</tbody>';

			}

			msg += '</table>';

		}

		// dir, dirxml method ? ...
		else if ( [ 'dir', 'dirxml' ].includes(method) ) msg = encodeObject(msg);

		// message string ? parse replacements ...
		else if ( typeof msg === 'string' ) {

			[...msg.matchAll(/%(c|s|o|O|i|d|f|\.(\d+)(i|d|f))/g)].reverse().forEach(match=>{

				let
				flag = match[3] ?? match[1],
				prec = parseInt( match[2] ?? 0 ),
				begin = msg.substring(0, match.index),
				end = msg.substring(match.index + match[0].length),
				arg = args.pop();

				switch ( flag ) {

					case 'c':
						msg = begin + '<span style="' + encodeHtml(arg, true) + '">' + end + '</span>';
						break;

					case 'o':
					case 'O':
						msg = begin + encodeObject(arg) + end;
						break;

					case 'd':
					case 'i':
						arg = parseInt(getNumber(arg));
						if ( prec ) arg = String(arg).padStart(prec, '0');
						msg = begin + arg + end;
						break;

					case 'f':
						arg = parseFloat(getNumber(arg));
						if ( prec ) arg = arg.toPrecision( String(parseInt(arg)).length + prec );
						msg = begin + arg + end;
						break;

					case 's':
					default:
						msg = begin + encodeHtml(arg) + end;
						break;

				}

			});

		}

		// message defined ? encode ...
		else if ( msg !== undefined ) msg = encodeObject(msg);

		// any remaining arguments ? encode and add them ...
		if ( args.length ) msg = String(msg).concat(' ', args.map(arg=>encodeObject(arg)).join(' '));

		// has message ? set item content ...
		if ( msg ) appendTo(itemElement, String(msg));

		// group ? ...
		if ( method.startsWith('group') ) {

			// add onclick listener ...
			itemElement.addEventListener('click', groupCollapsed);

			// class as group ...
			itemElement.classList.add('group');

			// collapsed ? ...
			if ( method == 'groupCollapsed' ) itemElement.classList.add('collapsed');

			// create list ...
			let listElement = document.createElement('ul');

			// append list to item ...
			itemElement.append(listElement);

			// append item to console ...
			consoleElement.append(itemElement);

			// assign console to list so that subsequent items attach to the group ...
			consoleElement = listElement;

		}

		// item ...
		else if ( msg ) {
			itemElement.classList.add(method);
			consoleElement.append(itemElement);
		}

	});

	// ensure any object elements have click events @note these cannot be called from inline onclick attributes in the tags as Firefox throws all kinds of security errors because reasons I guess
	const objectElements = document.getElementsByClassName('object');
	for ( let i=0; i < objectElements.length; i++ ) objectElements.item(i).addEventListener('click', toggleExpanded);

}


/**
 * Returns open console element for open tab.
 * @param integer tabId
 * @returns HTMLElement console
 */
function getConsole( tabId ) {

	// stringify tabId ...
	tabId = String(tabId);

	// get tab console element ...
	let consoleElement = document.getElementById(tabId);

	// no console ? ...
	if ( ! consoleElement ) {

		// create console ...
		consoleElement = document.createElement('ul');
		consoleElement.id = tabId;
		consoleElement.className = 'console';

		// append to body ...
		document.body.appendChild(consoleElement);

	}

	// query open consoles ...
	const consoleElements = document.getElementsByClassName('console open');

	// iterate over consoles ...
	for ( let i = 0; i < consoleElements.length; i++ ) {

		// console already open ? skip ...
		if ( consoleElements.item(i) === consoleElement ) continue;

		// close inactive tab console ...
		else consoleElements.item(i).classList.remove('open');

	}

	// ensure our console is open ...
	consoleElement.classList.add('open');

	return consoleElement;
}


/**
 * Remove console.
 * @param integer tabId
 * @return void
 */
function removeConsole( tabId ) {

	// stringify tabId ...
	tabId = String(tabId);

	// get tab console element ...
	let consoleElement = document.getElementById(tabId);

	// has console ? remove ...
	if ( consoleElement ) consoleElement.remove();

}


/**
 * Messages sent by bg.js Tab.sendPanel()
 */
browser.runtime.onMessage.addListener(( details )=>{

	const tabId = details.tabId;

	// has args ? process ...
	if ( details.args ) processConsoleMessages( details.args, tabId );

	// toggle on ? show console ...
	else if ( details?.toggle === true ) getConsole(tabId);

	// toggle off ? remove console ...
	else if ( details?.toggle === false ) removeConsole(tabId);

});
