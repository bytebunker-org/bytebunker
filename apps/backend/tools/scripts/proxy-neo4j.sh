#!/bin/bash

ssh -N -L 7474:localhost:7474 -L 7687:localhost:7687 titan

