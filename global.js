"use strict";
/**
 * Global scripts.
 */

/**
 * Default options object.
 * @since 1.5
 * @since 1.7
 *	- added classname substitution style.
 *	- added display_data_url option.
 * @since 3.0
 * 	- added debug substitution style.
 * @var object
 */
const DEFAULT_OPTIONS = {
	console_substitution_styles: {
		error: 'color:red;',
		warn: 'color:orange;',
		info: 'color:limegreen;',
		debug: '',
		log: '',
		group: 'color:mediumturquoise;border-bottom:1px dashed;cursor:pointer;',
		number: 'background-color:dodgerblue;color:white;font-weight:bold;border-radius:0.5em;padding:0em 0.3em;',
		fileline: 'color:mediumpurple;font-style:italic;border-style:solid;border-width:0px 1px;border-radius:0.5em;padding:0em 0.5em;',
		classname: 'font-weight:bold;',
		header: 'display:block;background-color:black;color:white;text-align:center;padding:0.2em;border-radius:0.3em;'
	},
	display_data_url: true
};

