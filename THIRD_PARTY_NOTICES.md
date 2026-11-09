# Third-party material

## three.js

`egocatch/static/js/vendor/three.module.min.js` is three.js r160, Copyright 2010-2023 Three.js Authors, under the
MIT License (<https://github.com/mrdoob/three.js/blob/dev/LICENSE>).

## Robot model

The see-through robot in `egocatch/static/robot/` is simplified from the Unitree G1 with Inspire hands model
(`g1_29dof_rev_1_0_with_inspire_hand_DFQ.urdf`) in [unitree_ros](https://github.com/unitreerobotics/unitree_ros),
redistributed under its licence:

```
BSD 3-Clause License

Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.```

## Object models

The object renders in `egocatch/static/catalog/` and the object shapes in `egocatch/static/robot/` and
`egocatch/static/bench/` are made from 3D models in these collections, each under its own terms:

- [Objaverse](https://objaverse.allenai.org/): each object under the Creative Commons licence its author chose.
- [YCB Object and Model Set](https://www.ycbbenchmarks.com/): CC BY 4.0.
- [Google Scanned Objects](https://arxiv.org/abs/2204.11918): CC BY 4.0.
- [DexGraspNet 2.0](https://pku-epic.github.io/DexGraspNet2.0/): see the project page.
- [Amazon Berkeley Objects](https://amazon-berkeley-objects.s3.amazonaws.com/index.html): CC BY-NC 4.0.

They appear here for non-commercial research communication.

## Simulation

Clips and renders were produced with [NVIDIA Isaac Lab](https://github.com/isaac-sim/IsaacLab) and Isaac Sim.

## Font

The page loads Schibsted Grotesk from Google Fonts (SIL Open Font License 1.1).
