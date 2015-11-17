"use strict";

var path   = require ('path'),
	fs     = require ('fs'),
	os     = require ('os'),
	util   = require ('util'),
	io     = require ('./io/easy'),
	confFu = require ('conf-fu');

var MODULE_NAME = 'dataflo.ws';
var INITIATOR_PATH = 'initiator';

var EventEmitter = require ('events').EventEmitter;

var dataflows = require ('./');
var paint     = dataflows.color;

var Project = function (rootPath) {

	var rootSearch = new io (rootPath || process.env.PROJECT_ROOT || process.cwd());

	this.configDir = process.env.PROJECT_CONF || '.dataflows';
	this.varDir    = process.env.PROJECT_VAR  || '.dataflows';

	this.confParams = {
		projectRoot:  rootSearch.path,
		configRoot:   this.configDir,
		instanceFile: 'instance',
		configName:   'project',
		fixupName:    '<$instance>/fixup'
	};

	rootSearch.findUp (this.configDir, function (err, projectRoot, stats) {
		// TODO: handle err
		// console.log ('config root', '.dataflows');
		// console.log ('project root', projectRoot.path);

		this.root = projectRoot;
		this.confParams.projectRoot = projectRoot.path;

		var conf = new confFu (this.confParams);

		this.fixes = 0;
		this.fatal = false;

		conf.on ('ready', this.configReady.bind (this, conf));

		conf.on ('notReady', this.configNotReady.bind (this, conf));

		conf.on ('error', this.configError.bind (this, conf));

	}.bind (this));

};

module.exports = Project;

util.inherits (Project, EventEmitter);

Project.prototype.configReady = function (conf) {
	// console.log (conf, conf.configFile.path, conf.fixupFile.path);
	// console.log (conf.config.initiator.http.flows);

	this.config = conf.config;

	this.emit ('ready');
}

function logVariables (conf) {
	console.log (paint.error ("those config variables is unpopulated:"));

	conf.logVariables ();

	var messageChunks = [
		paint.error ((conf.fixupFile? "" : "you must define fixup path, then") + "you can execute"),
		paint.yellow ("<variable> <value>"),
		"to define individual variables\n or edit",
		conf.fixupFile ? paint.path (conf.fixupFile.shortPath ()) : "fixup file",
		"to define all those vars at once"
	];

	console.log.apply (console, messageChunks);
}

Project.prototype.configNotReady = function (conf) {
	if (!this.fixes) {
		logVariables (conf);
		return;
	}

	var confFix = new confFu (this.confParams);

	// after we have written instance file, config can exists, so just return it
	confFix.on ("ready", this.configReady.bind (this, confFix));

	// otherwise, notify user
	confFix.on ("notReady", function () {
		// console.log ("not ready");
		logVariables (confFix);
	});
}

Project.prototype.configError = function (conf, eOrigin, eType, eData, eFile) {
	// console.log (conf, conf.configFile.path, conf.fixupFile.path);
	//
	if (eOrigin === "instance" && eType === "file") {
		// create instance file, directory for fixup and relaunch to generate fixup
		conf.instanceFile.writeFile (generatedInstance ());
		conf.configRoot.mkpath (generatedInstance ());
		this.fixes ++;

	} else if (eOrigin === "fixup" && eType === "file") {
		// make sure directory is created or fixup file can be read
		conf.configRoot.mkpath (conf.instance);
		this.fixes ++;

	} else if (eType === "parse") {
		console.log ("cannot parse file", eFile, eData);

	} else if (eOrigin === "core" && eType === "file") {
		console.log ("core config file must be present", eFile, eData);

	} else if (eOrigin === "config" && eType === "variables") {
		// nothing to do, conf-fu will emit not ready and unpopulated variables will be logged

	} else {
		console.log ("error origin: %s, type: %s, data: %s, file: %s", eOrigin, eType, eData, eFile);
	}
}

function generatedInstance () {
	return [
		(process.env.USER || process.env.USERNAME),
		(process.env.HOSTNAME || process.env.COMPUTERNAME || os.hostname())
	].join ('@');
}


/**
 * Find and load configuration files with predefined names, like project and fixup
 * @param {String} type affect what type of config to load — project or fixup
 */
Project.prototype.findAndLoad = function (type, cb) {

	var dirToRead;
	if (type === "project") {
		dirToRead = this.configDir;
	} else {
		dirToRead = path.join (this.configDir, this.instance);
	}

	fs.readdir (dirToRead, function (err, files) {
		var configFileName;
		files.some (function (fileName) {
			if (path.basename (fileName, path.extname (fileName)) === type) {
				configFileName = fileName;
				return true;
			}
		});

		// TODO: check for supported formats after migration to conf-fu

		if (configFileName && type === "project") {
			this.loadConfig (new io (path.join (dirToRead, configFileName)));
			return;
		} else if (type === "fixup" && cb) {
			cb (new io (path.join (dirToRead, configFileName || "fixup.json")));
			return;
		}

		var message = "Can't find "+type+" config in " + this.configDir + " folder. Please relaunch `dataflows init`";
		console.error (paint.dataflows(), paint.error (message));
		// process.kill ();
		this.emit ('error', message);

	}.bind (this));
	// var configFile = this.root.fileIO (path.join(this.configDir, 'project'))
}

Project.prototype.connectors = {};
Project.prototype.connections = {};

// TODO: remove this in favor of dataflows

Project.prototype.getModule = function (type, name, optional) {
	return dataflows.getModule (type, name, optional, this.root);
};

Project.prototype.getInitiator = function (name) {
	return this.getModule ('initiator', name);
};

Project.prototype.getTask = function (name) {
	return this.getModule ('task', name);
};

Project.prototype.require = function (name, optional) {
	return this.getModule ('', name, optional);
};
