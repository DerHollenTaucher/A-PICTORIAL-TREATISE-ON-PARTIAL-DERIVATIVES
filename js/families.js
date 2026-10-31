/* ==========================================================================
   families.js — 可调参数的函数族 / parameterised surface families
   Every family is an expression in x, y plus free parameters a, b, c
   (or p, q, r for the custom one).  Adding a family here is all that the
   UI needs to grow a new set of sliders.
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  var P = function (k, min, max, step, def, zh, en) {
    return { k: k, min: min, max: max, step: step, def: def, zh: zh, en: en };
  };

  var list = [
    {
      id: 'saddle',
      zh: '马鞍面', en: 'Saddle',
      expr: 'a*x^2 - b*y^2',
      params: [
        P('a', -3, 3, 0.05, 1.0, '横向曲率 a', 'curvature a'),
        P('b', -3, 3, 0.05, 1.0, '纵向曲率 b', 'curvature b')
      ],
      note: {
        zh: '谷与丘相接；原点处两方向坡度反号。系数不同则两轴不再对称。',
        en: 'Valley meets hill; at the origin the two slopes have opposite signs.'
      }
    },
    {
      id: 'paraboloid',
      zh: '抛物面', en: 'Paraboloid',
      expr: 'a*(x^2 + y^2)',
      params: [P('a', -1.5, 2.5, 0.05, 0.55, '曲率 a', 'curvature a')],
      note: {
        zh: '四向皆升；梯度自原点四射，等高线为同心圆。',
        en: 'Rises every way; contours are concentric circles.'
      }
    },
    {
      id: 'hyperbolic',
      zh: '双曲抛物面', en: 'Hyperbolic paraboloid',
      expr: 'a*x*y',
      params: [P('a', -2.5, 2.5, 0.05, 1.0, '交叉系数 a', 'cross term a')],
      note: {
        zh: '交叉项：沿 x 行走时坡度取决于所在的 y。',
        en: 'A cross term: the slope along x depends on the y you stand at.'
      }
    },
    {
      id: 'ripple',
      zh: '起伏波纹', en: 'Ripple',
      expr: 'a*sin(b*x)*cos(c*y)',
      params: [
        P('a', -2.5, 2.5, 0.05, 1.2, '振幅 a', 'amplitude a'),
        P('b', 0.2, 4, 0.05, 1.6, '频率 b（x 向）', 'freq. b (x)'),
        P('c', 0.2, 4, 0.05, 1.2, '频率 c（y 向）', 'freq. c (y)')
      ],
      note: {
        zh: '偏导可在某点为零，而该点并非极值 —— 沿另一方向仍在变化。',
        en: 'A partial may vanish where no extremum exists: the other direction still moves.'
      }
    },
    {
      id: 'gaussian',
      zh: '高斯钟形丘', en: 'Gaussian hill',
      expr: 'a*exp(-b*(x^2 + y^2))',
      params: [
        P('a', 0.2, 4, 0.05, 2.4, '峰高 a', 'height a'),
        P('b', 0.05, 2, 0.05, 0.45, '陡度 b', 'steepness b')
      ],
      note: {
        zh: '峰顶偏导为零；离峰越远，曲面对参数越不敏感。',
        en: 'Both partials vanish at the crown; far away the surface is nearly flat.'
      }
    },
    {
      id: 'ridge',
      zh: '山脊', en: 'Ridge',
      expr: 'a*x*exp(-b*(x^2 + y^2))',
      params: [
        P('a', -3, 3, 0.05, 1.8, '脊高 a', 'height a'),
        P('b', 0.05, 2, 0.05, 0.55, '收束 b', 'spread b')
      ],
      note: {
        zh: '沿脊背走高度不变；横跨山脊则坡度最陡。',
        en: 'Along the crest the height is level; across it the slope is steepest.'
      }
    },
    {
      id: 'cubic',
      zh: '立方鞍', en: 'Cubic saddle',
      expr: 'a*x^3 - b*y^3',
      params: [
        P('a', -1, 1, 0.01, 0.35, '横向 a', 'along x, a'),
        P('b', -1, 1, 0.01, 0.35, '纵向 b', 'along y, b')
      ],
      note: {
        zh: '二阶偏导在原点为零：一阶判据在此失灵。',
        en: 'Second partials vanish at the origin; the first-order test fails here.'
      }
    },
    {
      id: 'sombrero',
      zh: '墨西哥帽', en: 'Sombrero',
      expr: 'a*cos(b*sqrt(x^2 + y^2))*exp(-c*(x^2 + y^2))',
      params: [
        P('a', 0.2, 4, 0.05, 2.0, '振幅 a', 'amplitude a'),
        P('b', 0.2, 6, 0.05, 3.2, '环数 b', 'rings b'),
        P('c', 0.05, 1.5, 0.05, 0.22, '衰减 c', 'decay c')
      ],
      note: {
        zh: '同心涟漪叠于钟形之上；沿半径方向的坡度反复变号。',
        en: 'Concentric ripples upon a bell; the radial slope changes sign again and again.'
      }
    },
    {
      id: 'custom',
      zh: '自定义', en: 'Custom',
      expr: null,
      params: [
        P('p', -3, 3, 0.05, 1.0, '参数 p', 'parameter p'),
        P('q', -3, 3, 0.05, 1.0, '参数 q', 'parameter q'),
        P('r', -3, 3, 0.05, 0.5, '参数 r', 'parameter r')
      ],
      note: {
        zh: '在下方输入自己的式子：自变量 x, y；可用 p, q, r 作参数。',
        en: 'Type your own formula: variables x, y; p, q, r serve as parameters.'
      }
    }
  ];

  D.families = list;
  D.familyById = function (id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  };
  D.defaultParams = function (fam) {
    var o = {};
    for (var i = 0; i < fam.params.length; i++) o[fam.params[i].k] = fam.params[i].def;
    return o;
  };
})(window.DC);
