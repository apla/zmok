var FTPClient         = require ('node-ftp/ftp'),
	common            = require ('common'),
	fs                = require ('fs'),
	ftpManager        = require ('model/ftp/model-manager');

var pipeProgress = function (config) {
	this.bytesTotal = 0;
	this.bytesPass  = 0; // because bytes can be read and written
	this.lastLogged = 0;
	common.extend (this, config);
}

pipeProgress.prototype.watch = function () {
	var self = this;
	if (this.reader && this.readerWatch) {
		this.reader.on (this.readerWatch, function (chunk) {
			self.bytesPass += chunk.length;
		});
	} else if (this.writer && this.writerWatch) {
		this.writer.on (this.writerWatch, function (chunk) {
			self.bytesPass += chunk.length;
		});
	}
}

var ftpModel = module.exports = function (modelBase) {
	
	this.modelBase = modelBase;
	this.url = modelBase.url;
	
}

common.extend(ftpModel.prototype, {

	store: function (source) {
		
		var self = this;
		
		var isStream = source.from instanceof fs.ReadStream;
		
		if (!isStream) {
			self.emitError('Source is not ReadStream');
			return;
		}
		
		var progress = new pipeProgress ({
			reader: source.from,
			readerWatch: 'data',
			totalBytes: source.size
		});
		
		self.ftp = new FTPClient({ host: self.url.hostname});
				
		self.ftp.on ('error', function (e) {
			if (self.emitError(e)) {
				self.ftp.end();
			}
		});
		
		self.ftp.on ('timeout', function () {
			if (self.emitError('connTimeout is over')) {
				self.ftp.end();
			}
		});
		
		self.readStream = source.from;
		
		self.readStream.on ('data', function (chunk) {
			self.modelBase.emit('data', chunk);
		});
		
		self.readStream.on ('error', function (err) {
			console.log ('readStream error');			
			if (self.emitError(e)) {
				self.ftp.end();
			}
		});

		self.ftp.on('connect', function() {
			
			var auth = self.url.auth.split (':');
			self.ftp.auth(auth[0], auth[1], function(e) {
				
				if (self.emitError(e)) {
					self.ftp.end();
					return;
				}
				
				var cwdTarget = self.url.pathname.substring(1);
				
				self.ftp.cwd (cwdTarget, function (e) {
				
					if (e) { //self.emitError(e)) {
						self.ftp.end();
						return;
					}
					
					progress.watch ();
					
					self.readStream.resume ();
										
					var putResult = self.ftp.put(self.readStream, source.originalFileName, function(e) {
						
						if (self.emitError(e)) {
							self.ftp.end();
							return;
						}
						
						self.ftp.end();
						
						self.modelBase.emit('end');
						
					});
					
				});
				
			});		
		
		});
		
		// add self for watching into ftpModelManager
		project.ftpModelManager.add(self, source);
		
		return progress;
	},
	
	run: function () {
		this.ftp.connect();
	},
	
	stop: function () {
		this.ftp.end();
	},
	
	emitError: function (e) {
		if (e) {
			this.modelBase.emit('error', e);
			return true;
		} else {
			return false;
		}
	}
	
});