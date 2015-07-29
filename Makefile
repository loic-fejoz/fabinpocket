all: build

build/js/:
	mkdir -p build/js

build: build/index.html build/js/tdl/base.js build/js/fabinpocket.min.js build/js/jquery-2.1.4.min.js build/fabinpocket.min.css build/test-chat2.png

build/index.html: index.html
	sed 's/fabinpocket.js/fabinpocket.min.js/g' $< | sed 's|js/jquery-2.1.4.min.js|https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js|g' | sed 's/fabinpocket.css/fabinpocket.min.css/g' | sed 's|js/three.min.js|https://cdnjs.cloudflare.com/ajax/libs/three.js/r71/three.min.js|g' > $@

build/js/tdl/base.js: build/js/ js/tdl/base.js
	cp -rf js/tdl build/js/

build/js/jquery-2.1.4.min.js:  js/jquery-2.1.4.min.js
	cp -f $< $@

build/js/fabinpocket.min.js: js/fabinpocket.js
	yui-compressor -o $@ $<

build/fabinpocket.min.css: fabinpocket.css
	yui-compressor -o $@ $<

build/test-chat2.png: test-chat2.png
	cp -f $< $@

js/tdl/base.js:
	cd js && \
	git clone https://github.com/greggman/tdl.git tdl-git && \
	mv tdl-git/tdl . && \
	rm -Rf tdl-git

js/jquery-2.1.4.min.js:
	cd js && \
	wget http://code.jquery.com/jquery-2.1.4.min.js

build-dep: js/jquery-2.1.4.min.js js/tdl/base.js
	sudo apt-get install yui-compressor

clean:
	rm *~ js/*~
