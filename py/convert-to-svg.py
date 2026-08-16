try:
    import vtracer
except Exception:
    # Some environments install the package as 'vtrace'
    import vtrace as vtracer

# Input and output file paths
input_png = "../assets/lime-slice-original.jpeg"  # run this script from the py/ directory
output_svg = "lime_slice.svg"

# NOTE: vtracer's Python binding (tested on 0.6.10 and 0.6.15) segfaults under Python
# 3.14 when *any* option is passed as a keyword argument — this is a bug in the native
# extension's keyword-argument parsing, not a bad parameter value (a call with zero
# kwargs works fine). Passing the same values positionally avoids the crash entirely.
# Order: image_path, out_path, colormode, hierarchical, mode, filter_speckle,
#        color_precision, layer_difference, corner_threshold, length_threshold,
#        max_iterations, splice_threshold, path_precision
vtracer.convert_image_to_svg_py(
    input_png,
    output_svg,
    "color",  # colormode: color vs binary
    "stacked",  # hierarchical: how shapes are stacked
    "spline",  # mode: curve fitting (spline vs polygon)
    4,  # filter_speckle: removes small noise/artifacts (lower = keep finer details)
    8,  # color_precision: precision of color quantization
    16,  # layer_difference: granularity of color grouping
    60,  # corner_threshold: higher values produce smoother curves
    4.0,  # length_threshold: minimum length of path segment
    10,  # max_iterations: optimization iterations
    45,  # splice_threshold: angle threshold for splicing paths
    3,  # path_precision: floating point precision for SVG coordinates
)

print(f"Successfully converted '{input_png}' to '{output_svg}'!")
