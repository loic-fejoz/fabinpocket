all:

js/tdl/base.js:
	cd js && \
	git clone https://github.com/greggman/tdl.git tdl-git && \
	mv tdl-git/tdl . && \
	rm -Rf tdl-git

js/jquery-2.1.4.min.js:
	cd js && \
	wget http://code.jquery.com/jquery-2.1.4.min.js

build-dep: js/jquery-2.1.4.min.js js/tdl/base.js

