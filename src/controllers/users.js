const { isValidObjectId } = require("mongoose");

const { getToken } = require("../middlewares/public/authenticator");
const { usersModel, profilesModel, passwordTokensModel } = require("../models");
const profilesController = require("./profiles");
const sendEmail = require("../utils/nodeMailer");

exports.signup = async (req, res, next) => {
	try {
		const { username, email, password, phone, type } = req.body;
		const userObj = {};
		if (username) userObj.username = username;
		if (email) userObj.email = email;
		if (type) userObj.type = type;
		if (phone) userObj.phone = phone;
		var user = await usersModel.register(new usersModel(userObj), password);
		const profileObj = {};
		profileObj.user = user._id;
		const profile = await profilesModel.create(profileObj);
		user.profile = profile._id;
		await user.save();
		const token = getToken({ _id: user._id });
		return res.json({
			success: true,
			user: await usersModel.findOne({ _id: user._id }).populate("profile"),
			token,
		});
	} catch (error) {
		if (user) await user.remove();
		next(error);
	}
};

exports.login = async (req, res, next) => {
	try {
		const { _id, phone } = req.user;
		const query = { status: "active" };
		if (phone) query.phone = phone;
		else if (_id) query._id = _id;
		const userExists = await usersModel.findOne(query).populate("profile");
		if (userExists) {
		} else return next(new Error("User deleted!"));

		const token = getToken({ _id: userExists._id });
		return res.json({
			success: true,
			user: userExists,
			token,
		});
	} catch (error) {
		next(error);
	}
};

exports.editUserProfile = async (req, res, next) => {
	try {
		const { user } = req.body;
		if (user) {
			if (req.user.type === "admin")
				if (isValidObjectId(user))
					if (await usersModel.exists({ _id: user })) {
					} else return next(new Error("User not found!"));
				else return next(new Error("Please enter valid user id!"));
			else return next(new Error("Unauthorized as ADMIN!"));
		}
		const responseUserUpdate = await profilesController.updateUser(
			req,
			res,
			next
		);
		const responseProfileUpdate = await profilesController.updateProfile(
			req,
			res,
			next
		);
		return res.json({
			success: responseProfileUpdate && responseUserUpdate,
			user: await usersModel.findOne({ _id: req.user._id }).populate("profile"),
		});
	} catch (error) {
		next(error);
	}
};

exports.setState = async (user, state) => {
	try {
		if (!user) throw new Error("Please enter user id!");
		if (!isValidObjectId(user)) throw new Error("Please enter valid user id!");
		if (state) {
			const update = await usersModel.updateOne(
				{ _id: user },
				{ state },
				{
					useFindAndModify: false,
					new: true,
					runValidators: true,
				}
			);
			return { success: update.modifiedCount == 0 ? false : true };
		}
		throw new Error("Please enter user state!");
	} catch (error) {
		throw error;
	}
};

exports.checkUserPhoneExists = async (req, res, next) => {
	try {
		const userExists = await usersModel.exists({ phone: req.body.phone });
		if (userExists) {
			next();
		} else next(new Error("User does not exist!"));
	} catch (error) {
		next(error);
	}
};

exports.getUser = async (req, res, next) => {
	try {
		let { user } = req.params;
		const { isMe } = req.query;
		if (isMe) if (req?.user?._id) user = req.user._id;
		if (user)
			if (isValidObjectId(user)) {
				const response = await usersModel
					.findOne({ _id: user })
					.populate("profile");
				if (response)
					return res.json({
						success: "true",
						user: response,
					});
				else return next(new Error("User not found!"));
			} else return next(new Error("Please enter valid user id!"));
		else return next(new Error("Please enter user id!"));
	} catch (error) {
		next(error);
	}
};

exports.emailResetPassword = async (req, res, next) => {
	try {
		const { email } = req.body;
		const userExists = await usersModel.findOne({ email });
		if (userExists) {
		} else return next(new Error("User with given email doesn't exist!"));

		let passwordTokenExists = await passwordTokensModel.findOne({
			user: userExists._id,
		});
		if (passwordTokenExists) {
		} else {
			const passwordTokenObj = {};
			passwordTokenObj.user = userExists._id;
			passwordTokenObj.token = getToken({ _id: userExists._id });
			passwordTokenExists = await new passwordTokensModel(
				passwordTokenObj
			).save();
		}

		const link = `${process.env.BASE_URL}forgot-password?user=${userExists._id}&token=${passwordTokenExists.token}`;
		const body = `
To reset your password, click on this link 
${link}
Link will expire in 10 minutes.

If you didn't do this, click here backendboilerplate@gmail.com`;
		await sendEmail(userExists.email, "Password reset", body);

		res.json({
			success: true,
			message: "Password reset link sent to your email address!",
		});
	} catch (error) {
		return next(error);
	}
};

exports.resetPassword = async (req, res, next) => {
	try {
		const { password, user, token } = req.body;

		const userExists = await usersModel.findById(user);
		if (userExists) {
		} else return next(new Error("Invalid link!"));

		const passwordTokenExists = await passwordTokensModel.findOne({
			user,
			token,
		});
		if (passwordTokenExists) {
		} else return next(new Error("Invalid or expired link !"));

		await userExists.setPassword(password);
		await userExists.save();
		await passwordTokenExists.delete();

		res.json({ success: true, message: "Password reset sucessfully." });
	} catch (error) {
		return next(error);
	}
};

exports.getAllUsers = async (req, res, next) => {
	try {
		let { q, page, limit, status, type } = req.query;
		const { _id } = req.user;
		const query = {};
		page = Number(page);
		limit = Number(limit);
		if (!limit) limit = 10;
		if (!page) page = 1;
		query._id = { $ne: _id };
		if (type) query.type = type;
		if (status) query.status = status;
		if (q && q.trim() !== "") {
			var wildcard = [
				{
					$regexMatch: {
						input: "$firstname",
						regex: q,
						options: "i",
					},
				},
				{
					$regexMatch: {
						input: "$lastname",
						regex: q,
						options: "i",
					},
				},
			];
		}
		const aggregation = [
			{ $match: query },
			{ $project: { profile: 1 } },
			{
				$lookup: {
					from: "profiles",
					let: { profile: "$profile" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{
											$and: [{ $eq: ["$$profile", "$_id"] }],
										},
										{
											$or: wildcard ?? {},
										},
									],
								},
							},
						},
					],
					as: "profile",
				},
			},
			{ $unwind: { path: "$profile" } },
		];

		const users = await usersModel
			.aggregate(aggregation)
			.skip((page - 1) * limit)
			.limit(limit)
			.sort({ createdAt: -1 });

		aggregation.push(
			...[
				{ $group: { _id: null, count: { $sum: 1 } } },
				{ $project: { _id: 0 } },
			]
		);

		const totalCount = await usersModel.aggregate(aggregation);

		return res.status(200).json({
			success: true,
			totalPages: Math.ceil((totalCount[0]?.count ?? 0) / limit),
			users,
		});
	} catch (error) {
		next(error);
	}
};
