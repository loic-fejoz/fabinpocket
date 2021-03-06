FabInPocket - Tools in your pocket to design 3D models to make in a FabLab
===============================================================================

Description
-----------

[FabInPocket](https://github.com/loic-fejoz/fabinpocket) is a simple online tool to design 3D models on your smartphone or tablet for 3D printing or milling.

The main idea is for a newcomer in a FabLab to be able to 3D print or mill its own model on the first day.

As of 2nd August 2015, it is possible to draw on canvas (on desktop browser), import existing image, and then export as STL or PNG heightmap.

System Requirements
----------------------

As of 11th July 2015, FabInPocket requiers:

- a (desktop) browser with WebGL enable

Installation
------------

Nothing, just redirect your browser to [http://loic-fejoz.github.io/fabinpocket/](http://loic-fejoz.github.io/fabinpocket/).

## Contribute

If you would like to hack on FabInPokcet, start by forking the repo on GitHub:

https://github.com/loic-fejoz/fabinpocket

The best way to contribute is probably one of the following:

* Clone the repo and follow [GitHub
  Workflow](https://guides.github.com/introduction/flow/index.html).
* Contact [Me <loic@fejoz.net>](mailto:loic@fejoz.net).
* Visit Me.

What needs to be done:

* Provides a gallery of samples.
* Check STL export.
* Enhance code for better image updating.
* Make the 2D canvas drawable (partly done).
* Add direct 3D print to a local Octoprint server.
* Add engrave capability (ie write text or shape).
* Add user 3D navigation.
* Add export to other printers' native file format.
* Work on [all issues](https://github.com/loic-fejoz/fabinpocket/issues)

Changes
----------

## 2nd August 2015
* Smooth 3D artecfacts by using exact euclidean distance instead of Manathan one.
![A comparison of distance calculation](distance-comparison.png)

## 29th July 2015
* Enhance 3D rendering with shadow by using [three.js](http://threejs.org/) framework.

## 13th July 2015
* Add simple drawing capabilities.

## 11th July 2015
* First deployment: import existing image, and then export as STL or PNG heightmap.

Authors
-------

This is a list of people who have contributed code or ideas to FabInPocket --
for copyright purposes or whatever.

* Loïc Fejoz <loic@fejoz.net> <https://github.com/loic-fejoz/>
